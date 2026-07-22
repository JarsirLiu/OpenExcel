import {
  buildExcelToolCatalog,
  buildRunToolContext,
  buildSystemPrompt,
  buildWorkspaceToolContext,
  formatAIError,
  removeEmptyAssistantMessages,
  streamChat as streamAgentChat,
  ToolResultBudget,
  wrapToolSetWithResultBudget,
} from "@openexcel/agent";
import { loadModelConfig } from "../../../config.js";
import { chartTools } from "../../charts/tools/index.js";
import { excelTools } from "../../sheets/tools/index.js";
import { workbookTools } from "../../workbooks/tools/index.js";
import { extractFirstUserText, extractLatestUserText } from "../application/messageText.js";
import { scheduleSessionTitleGeneration } from "../application/title.js";
import { persistSessionMessages } from "../application/transcript.js";
import { SessionBusyError } from "../domain/sessionErrors.js";
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as repo from "../infrastructure/sessionRepository.js";
import * as runRepo from "../runs/repository.js";
import {
  clearSessionUndoCheckpoint,
  completeRunAndUpdateUndoCheckpoint,
} from "../runs/undoCheckpoint.js";
import { loadWorkspaceChatContext } from "./context.js";
import { resolveChatMessageReferences } from "./references.js";

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
  options: { clientRequestId?: string } = {},
) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("Session not found");

  const config = loadModelConfig();
  const workspace = await loadWorkspaceChatContext(workspaceId);
  const resolvedMessages = resolveChatMessageReferences(messages, workspace.workbooks);
  const workspaceContext = workspace.prompt;
  const systemPrompt = buildSystemPrompt(workspaceContext, buildExcelToolCatalog());
  const inputText = extractLatestUserText(resolvedMessages);

  const run = await withSessionLock(sessionId, async () => {
    const activeRun = await runRepo.findActiveRun(sessionId);
    if (activeRun) {
      if (runRepo.isRunStale(activeRun.startedAt)) {
        await runRepo.markRunStale(activeRun.id);
      } else {
        throw new SessionBusyError();
      }
    }

    await clearSessionUndoCheckpoint(workspaceId, sessionId);

    return runRepo.createRun({
      sessionId,
      status: "running",
      clientRequestId: options.clientRequestId,
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
    toolBudgets: { readSheetData: config.readSheetDataBudgetTokens },
    toolPolicies: { readSheetData: { kind: "paged-structured" } },
  });
  const tools = wrapToolSetWithResultBudget(
    { ...workbookTools, ...excelTools, ...chartTools } as any,
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
      await completeRunAndUpdateUndoCheckpoint(workspaceId, sessionId, run.id, data);
    } catch (error) {
      console.error(`[session] Failed to finalize run ${run.id}:`, error);
    }
  };

  const persistTranscript = async (transcript: any[]) => {
    try {
      await withSessionLock(sessionId, () =>
        persistSessionMessages(workspaceId, sessionId, transcript),
      );
    } catch (error) {
      console.error(`[session] Failed to persist transcript for session ${sessionId}:`, error);
    }
  };

  // Persist the submitted turn before generation starts. This keeps the user
  // message recoverable even if model setup or the network fails immediately.
  await persistTranscript(removeEmptyAssistantMessages(messages));

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
      messages: resolvedMessages,
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
      onEnd: async ({ messages: newMessages, isAborted }) => {
        const outcome: {
          status: string;
          outputText?: string | null;
          errorMessage?: string;
        } =
          terminalOutcome ??
          (isAborted
            ? { status: "aborted" }
            : { status: "error", errorMessage: "对话流未正常结束" });
        const transcript = removeEmptyAssistantMessages(newMessages);

        await persistTranscript(transcript);

        scheduleSessionTitleGeneration(
          workspaceId,
          sessionId,
          extractFirstUserText(transcript) || extractLatestUserText(messages),
        );

        await finalizeRunOnce(outcome);
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
