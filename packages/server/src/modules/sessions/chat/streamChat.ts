import {
  buildExcelToolCatalog,
  buildRunToolContext,
  buildSystemPrompt,
  buildWorkspaceToolContext,
  formatAIError,
  streamChat as streamAgentChat,
  ToolResultBudget,
  wrapToolSetWithResultBudget,
} from "@openexcel/agent";
import { loadModelConfig } from "../../../config.js";
import { excelTools } from "../../sheets/tools/index.js";
import { workbookTools } from "../../workbooks/tools/index.js";
import { SessionBusyError, withSessionLock } from "../concurrency.js";
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

function removeEmptyAssistantMessages(messages: any[]): any[] {
  return messages.filter(
    (message) =>
      !(
        message?.role === "assistant" &&
        Array.isArray(message.parts) &&
        message.parts.length === 0
      ),
  );
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

  const run = await withSessionLock(sessionId, async () => {
    const activeRun = await runRepo.findActiveRun(sessionId);
    if (activeRun) {
      if (runRepo.isRunStale(activeRun.startedAt)) {
        await runRepo.markRunStale(activeRun.id);
      } else {
        throw new SessionBusyError();
      }
    }

    return runRepo.createRun({
      sessionId,
      status: "running",
      model: config.modelName,
      systemPrompt,
      inputText,
    });
  });
  const toolsContext = {
    ...buildWorkspaceToolContext(workspaceId),
    ...buildRunToolContext(run.id, workspaceId),
  };
  const toolResultBudget = new ToolResultBudget({
    totalTokens: config.toolResultBudgetTokens,
    maxResultTokens: config.toolResultMaxTokens,
    toolBudgets: { readSheet: config.readSheetBudgetTokens },
  });
  const tools = wrapToolSetWithResultBudget(
    { ...workbookTools, ...excelTools } as any,
    toolResultBudget,
  );
  const toolNames = Object.keys(tools);

  let finalized = false;
  let terminalOutcome: {
    status: string;
    outputText?: string | null;
    errorMessage?: string;
  } | null = null;
  let stepOrder = 0;

  const finalizeRunOnce = async (data: Record<string, unknown>) => {
    if (finalized) return;
    finalized = true;
    try {
      await withSessionLock(sessionId, () =>
        runRepo.updateRun(run.id, {
          ...data,
          endedAt: new Date(),
        }),
      );
    } catch (error) {
      console.error(`[session] Failed to finalize run ${run.id}:`, error);
    }
  };

  const persistStepOnce = async (step: any) => {
    try {
      await withSessionLock(sessionId, () =>
        runRepo.createStep({
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
        }),
      );
    } catch (error) {
      console.error(`[session] Failed to persist step for run ${run.id}:`, error);
    }
  };

  const recordTerminalOutcome = (outcome: {
    status: string;
    outputText?: string | null;
    errorMessage?: string;
  }) => {
    terminalOutcome ??= outcome;
  };

  try {
    return await streamAgentChat({
      modelConfig: config,
      systemPrompt,
      messages,
      maxRetries: config.maxRetries,
      contextWindowTokens: config.contextWindowTokens,
      outputReserveTokens: config.outputReserveTokens,
      maxConversationTurns: config.maxConversationTurns,
      maxUserInputTokens: config.maxUserInputTokens,
      timeout: {
        totalMs: config.timeoutMs,
        chunkMs: config.chunkTimeoutMs,
      },
      tools: tools as any,
      toolsContext,
      prepareStep: async () => ({
        activeTools: toolNames.filter((name) => !toolResultBudget.isToolExhausted(name)) as any,
      }),
      abortSignal,
      onStepFinish: persistStepOnce,
      onFinish: async ({ text }: any) => {
        recordTerminalOutcome({
          status: "completed",
          outputText: typeof text === "string" && text.length > 0 ? text : null,
        });
      },
      onAbort: async () => {
        recordTerminalOutcome({ status: "aborted" });
      },
      onError: async (error: any) => {
        const errorMessage = formatAIError(error);
        console.error(`[session] AI stream error for run ${run.id}: ${errorMessage}`);
        recordTerminalOutcome({
          status: "error",
          errorMessage,
        });
      },
      onEnd: async ({ messages: newMessages }) => {
        const outcome =
          terminalOutcome ??
          ({ status: "error", errorMessage: "对话流未正常结束" } satisfies {
            status: string;
            errorMessage: string;
          });
        const transcript =
          outcome.status === "completed" ? newMessages : removeEmptyAssistantMessages(messages);

        try {
          await withSessionLock(sessionId, () =>
            persistSessionMessages(workspaceId, sessionId, transcript),
          );
        } catch (error) {
          console.error(`[session] Failed to persist transcript for session ${sessionId}:`, error);
        }

        await finalizeRunOnce(outcome);

        try {
          await withSessionLock(sessionId, () =>
            runRepo.pruneUndoSnapshots(workspaceId, sessionId),
          );
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
      errorMessage: formatAIError(error),
    });
    throw error;
  }
}
