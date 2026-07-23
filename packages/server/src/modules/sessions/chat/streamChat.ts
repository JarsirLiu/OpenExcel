import {
  buildExcelToolDefinitions,
  buildRunToolContext,
  buildWorkspaceToolContext,
  createAgentRunner,
  formatAIError,
  removeEmptyAssistantMessages,
  type ToolExecutor,
  ToolResultBudget,
  wrapToolSetWithResultBudget,
} from "@openexcel/agent";
import { loadModelConfig } from "../../../config.js";
import { chartTools } from "../../charts/tools/index.js";
import { excelTools } from "../../sheets/tools/index.js";
import { workbookTools } from "../../workbooks/tools/index.js";
import {
  appendChatTurn,
  type ChatTurnRequest,
  toCanonicalUserMessage,
} from "../application/chatTurn.js";
import { extractMessageText } from "../application/messageText.js";
import { scheduleSessionTitleGeneration } from "../application/title.js";
import { getSessionMessages, persistSessionMessages } from "../application/transcript.js";
import { SessionBusyError } from "../domain/sessionErrors.js";
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as repo from "../infrastructure/sessionRepository.js";
import {
  createAgentPersistenceBarrier,
  createIdempotentToolExecutor,
} from "../runs/agentPersistence.js";
import * as runRepo from "../runs/repository.js";
import {
  clearSessionUndoCheckpoint,
  completeRunAndUpdateUndoCheckpoint,
} from "../runs/undoCheckpoint.js";
import { loadWorkspaceChatContext } from "./context.js";
import { resolveChatMessageReferences } from "./references.js";

export async function streamChat(
  workspaceId: number,
  sessionId: number,
  turn: ChatTurnRequest,
  abortSignal?: AbortSignal,
) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("Session not found");

  const config = loadModelConfig();
  const workspace = await loadWorkspaceChatContext(workspaceId);
  const canonicalMessages = await getSessionMessages(workspaceId, sessionId);
  const userMessage = toCanonicalUserMessage(turn);
  const transcript = appendChatTurn(canonicalMessages, turn);
  const resolvedMessages = resolveChatMessageReferences(transcript, workspace.workbooks);
  const inputText = extractMessageText(userMessage);

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
    await persistSessionMessages(workspaceId, sessionId, transcript);

    return runRepo.createRun({
      sessionId,
      status: "running",
      clientRequestId: turn.requestId,
      model: config.modelName,
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
  const executionContext = { toolContexts: toolsContext, resultBudget: toolResultBudget };
  const concreteToolExecutor: ToolExecutor = {
    execute: async (
      toolName: string,
      input: unknown,
      options: { toolCallId: string; abortSignal?: AbortSignal; context: unknown },
    ) => {
      const tool = (
        tools as Record<string, { execute?: (value: unknown, options: unknown) => unknown }>
      )[toolName];
      if (!tool || typeof tool.execute !== "function") {
        throw new Error(`Tool ${toolName} is not executable`);
      }
      const context = executionContext.toolContexts[toolName];
      return tool.execute(input, {
        toolCallId: options.toolCallId,
        abortSignal: options.abortSignal,
        context,
      });
    },
  };
  const toolExecutor = createIdempotentToolExecutor(run.id, concreteToolExecutor);

  let finalized = false;
  let terminalOutcome: {
    status: string;
    outputText?: string | null;
    errorMessage?: string;
  } | null = null;

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
    await withSessionLock(sessionId, () =>
      persistSessionMessages(workspaceId, sessionId, transcript),
    );
  };

  const recordTerminalOutcome = (outcome: {
    status: string;
    outputText?: string | null;
    errorMessage?: string;
  }) => {
    terminalOutcome ??= outcome;
  };

  try {
    return await createAgentRunner({
      modelConfig: config,
      transcript: resolvedMessages,
      workspace: workspace.workbooks,
      maxRetries: config.maxRetries,
      contextWindowTokens: config.contextWindowTokens,
      outputReserveTokens: config.outputReserveTokens,
      maxConversationTurns: config.maxConversationTurns,
      maxUserInputTokens: config.maxUserInputTokens,
      timeout: {
        totalMs: config.timeoutMs,
        chunkMs: config.chunkTimeoutMs,
      },
      tools: buildExcelToolDefinitions(),
      toolExecutor,
      executionContext,
      persistenceBarrier: createAgentPersistenceBarrier(run.id),
      prepareStep: async () => ({
        activeTools: toolNames.filter((name) => !toolResultBudget.isToolExhausted(name)) as any,
      }),
      abortSignal,
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
        const generatedMessages = newMessages.slice(resolvedMessages.length);
        const completedTranscript = removeEmptyAssistantMessages([
          ...transcript,
          ...generatedMessages,
        ]);

        await persistTranscript(completedTranscript);

        scheduleSessionTitleGeneration(workspaceId, sessionId, inputText);

        await finalizeRunOnce(outcome);
      },
    })
      .run()
      .then((result) => result.stream);
  } catch (error) {
    await finalizeRunOnce({
      status: "error",
      errorMessage: formatAIError(error),
    });
    throw error;
  }
}
