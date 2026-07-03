import * as repo from "./repository.js";
import * as context from "./context.js";
import * as rollout from "./rollout.js";
import {
  buildSystemPrompt,
  buildExcelToolCatalog,
  buildExcelToolContext,
  generateSessionTitle,
  historyFromRuns,
  streamChat as streamAgentChat,
} from "@openexcel/agent";
import { excelTools } from "./tools/index.js";
import { loadModelConfig } from "../config.js";

function extractMessageText(message: any): string {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.parts)) {
    return message.parts
      .filter((part: any) => part.type === "text")
      .map((part: any) => part.text)
      .join("");
  }
  return "";
}

function extractLatestUserText(messages: any[]): string {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role === "user") {
      return extractMessageText(message);
    }
  }
  return "";
}

function serializeJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    try {
      return JSON.stringify(String(value));
    } catch {
      return null;
    }
  }
}

async function finalizeRun(runId: number, data: Record<string, unknown>) {
  await repo.updateRun(runId, {
    ...data,
    endedAt: new Date(),
  });
}

export async function getSessions() {
  return repo.findGlobalSessions();
}

export async function createSession() {
  return repo.createSession("新对话");
}

export async function deleteSession(sessionId: number) {
  return repo.deleteSession(sessionId);
}

export async function renameSession(sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name });
}

export async function getSession(sessionId: number) {
  return repo.findSession(sessionId);
}

export async function getMessages(sessionId: number) {
  const storedMessages = await rollout.getSessionMessages(sessionId);
  if (storedMessages.length > 0) return storedMessages;

  const runs = await repo.findRunsBySession(sessionId);
  return historyFromRuns(runs);
}

export async function getRuns(sessionId: number) {
  const runs = await repo.findRunsBySession(sessionId);
  const steps = await Promise.all(runs.map(async (run) => ({
    ...run,
    steps: await repo.findStepsByRun(run.id),
  })));
  return steps;
}

export async function streamChat(
  sessionId: number,
  messages: any[],
  abortSignal?: AbortSignal,
) {
  const session = await repo.findSession(sessionId);
  if (!session) throw new Error("Session not found");

  const config = loadModelConfig();
  const workplaceContext = await context.buildWorkplaceContext();
  const systemPrompt = buildSystemPrompt(workplaceContext, buildExcelToolCatalog());
  const inputText = extractLatestUserText(messages);

  const run = await repo.createRun({
    sessionId,
    status: "running",
    model: config.modelName,
    systemPrompt,
    inputText,
  });
  const toolsContext = buildExcelToolContext(run.id);

  let finalized = false;
  let stepOrder = 0;

  const finalizeRunOnce = async (data: Record<string, unknown>) => {
    if (finalized) return;
    finalized = true;
    try {
      await finalizeRun(run.id, data);
    } catch (error) {
      console.error(`[session] Failed to finalize run ${run.id}:`, error);
    }
  };

  const persistStepOnce = async (step: any) => {
    try {
      await repo.createStep({
        runId: run.id,
        type: String(step?.stepType ?? "step"),
        status: Array.isArray(step?.toolResults) && step.toolResults.some((result: any) => result?.isError)
          ? "error"
          : String(step?.finishReason ?? "completed"),
        content: typeof step?.text === "string" ? step.text : null,
        toolName: Array.isArray(step?.toolCalls)
          ? step.toolCalls
              .map((call: any) => call?.toolName)
              .filter((name: unknown): name is string => typeof name === "string" && name.length > 0)
              .join(",") || null
          : null,
        input: serializeJson(step?.toolCalls ?? []),
        output: serializeJson(step?.toolResults ?? []),
        order: stepOrder++,
      });
    } catch (error) {
      console.error(`[session] Failed to persist step for run ${run.id}:`, error);
    }
  };

  try {
    return await streamAgentChat({
      modelConfig: config,
      systemPrompt,
      messages,
      tools: excelTools,
      toolsContext,
      abortSignal,
      onStepFinish: persistStepOnce,
      onFinish: async ({ text }: any) => {
        await finalizeRunOnce({
          status: "completed",
          outputText: typeof text === "string" && text.length > 0 ? text : null,
        });
      },
      onAbort: async () => {
        await finalizeRunOnce({ status: "aborted" });
      },
      onError: async (error: any) => {
        await finalizeRunOnce({
          status: "error",
          errorMessage: error instanceof Error ? error.message : String(error),
        });
      },
      onEnd: async ({ messages: newMessages }) => {
        try {
          await rollout.persistSessionMessages(sessionId, newMessages);
        } catch (error) {
          console.error(`[session] Failed to persist transcript for session ${sessionId}:`, error);
        }

        try {
          await repo.pruneUndoSnapshots(sessionId);
        } catch (error) {
          console.error(`[session] Failed to prune undo snapshots for session ${sessionId}:`, error);
        }
      },
    });
  } catch (error) {
    await finalizeRunOnce({
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export async function generateSessionTitleForSession(sessionId: number, firstUserText: string) {
  const session = await repo.findSession(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.name !== "新对话") {
    return session.name;
  }

  const config = loadModelConfig();
  return generateSessionTitle(
    (id, data) => repo.updateSession(id, data),
    sessionId,
    firstUserText,
    config,
  );
}

export async function undoLatestRun(sessionId: number) {
  const run = await repo.findLatestUndoableRun(sessionId);
  if (!run) {
    throw new Error("没有可撤销的本轮修改");
  }

  const restoredSheetIds = await repo.restoreRunSheetSnapshots(run.id);
  return {
    runId: run.id,
    restoredSheetIds,
  };
}
