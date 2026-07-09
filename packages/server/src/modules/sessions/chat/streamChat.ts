import {
  buildExcelToolCatalog,
  buildRunToolContext,
  buildSystemPrompt,
  buildWorkspaceToolContext,
  streamChat as streamAgentChat,
} from "@openexcel/agent";
import { loadModelConfig } from "../../../config.js";
import { excelTools } from "../../sheets/tools/index.js";
import { workbookTools } from "../../workbooks/tools/index.js";
import * as repo from "../repository.js";
import * as runRepo from "../runs/repository.js";
import { persistSessionMessages } from "../transcript.js";
import { buildWorkspaceContext } from "./context.js";

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

export async function streamChat(
  workspaceId: number,
  sessionId: number,
  messages: any[],
  abortSignal?: AbortSignal,
) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("Session not found");

  const config = loadModelConfig();
  const workspaceContext = await buildWorkspaceContext(workspaceId);
  const systemPrompt = buildSystemPrompt(workspaceContext, buildExcelToolCatalog());
  const inputText = extractLatestUserText(messages);

  const run = await runRepo.createRun({
    sessionId,
    status: "running",
    model: config.modelName,
    systemPrompt,
    inputText,
  });
  const toolsContext = {
    ...buildWorkspaceToolContext(workspaceId),
    ...buildRunToolContext(run.id, workspaceId),
  };

  let finalized = false;
  let stepOrder = 0;

  const finalizeRunOnce = async (data: Record<string, unknown>) => {
    if (finalized) return;
    finalized = true;
    try {
      await runRepo.updateRun(run.id, {
        ...data,
        endedAt: new Date(),
      });
    } catch (error) {
      console.error(`[session] Failed to finalize run ${run.id}:`, error);
    }
  };

  const persistStepOnce = async (step: any) => {
    try {
      await runRepo.createStep({
        runId: run.id,
        type: String(step?.stepType ?? "step"),
        status:
          Array.isArray(step?.toolResults) &&
          step.toolResults.some((result: any) => result?.isError)
            ? "error"
            : String(step?.finishReason ?? "completed"),
        content: typeof step?.text === "string" ? step.text : null,
        toolName: Array.isArray(step?.toolCalls)
          ? step.toolCalls
              .map((call: any) => call?.toolName)
              .filter(
                (name: unknown): name is string => typeof name === "string" && name.length > 0,
              )
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
      tools: { ...workbookTools, ...excelTools },
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
          await persistSessionMessages(workspaceId, sessionId, newMessages);
        } catch (error) {
          console.error(`[session] Failed to persist transcript for session ${sessionId}:`, error);
        }

        try {
          await runRepo.pruneUndoSnapshots(workspaceId, sessionId);
        } catch (error) {
          console.error(
            `[session] Failed to prune undo snapshots for session ${sessionId}:`,
            error,
          );
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
