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
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as repo from "../infrastructure/sessionRepository.js";
import {
  createAgentPersistenceBarrier,
  createIdempotentToolExecutor,
} from "../runs/agentPersistence.js";
import { registerRunCancellation } from "../runs/cancellation.js";
import { type AcquiredRunLease, acquireRunLease } from "../runs/runLease.js";
import {
  clearSessionUndoCheckpoint,
  completeRunAndUpdateUndoCheckpoint,
} from "../runs/undoCheckpoint.js";
import { loadWorkspaceChatContext } from "./context.js";
import { resolveChatMessageReferences } from "./references.js";

export async function streamChat(workspaceId: number, sessionId: number, turn: ChatTurnRequest) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("Session not found");

  const config = loadModelConfig();
  const workspace = await loadWorkspaceChatContext(workspaceId);
  const userMessage = toCanonicalUserMessage(turn);
  const inputText = extractMessageText(userMessage);

  const lease: AcquiredRunLease = await withSessionLock(sessionId, () =>
    acquireRunLease({
      workspaceId,
      sessionId,
      requestId: turn.requestId,
      inputText,
      model: config.modelName,
      appendUserTurn: (canonicalTranscript) =>
        appendChatTurn(canonicalTranscript as Array<Record<string, unknown>>, turn),
    }),
  );
  const transcript = lease.transcript as Array<Record<string, unknown>>;
  const resolvedMessages = resolveChatMessageReferences(transcript, workspace.workbooks);
  const run = lease.run;
  try {
    await clearSessionUndoCheckpoint(workspaceId, sessionId);
  } catch (error) {
    await lease.release();
    throw error;
  }

  /* The lease transaction owns the canonical user turn. */
  const cancellation = registerRunCancellation(run.id);
  let leaseLost = false;
  lease.startHeartbeat(() => {
    leaseLost = true;
    cancellation.abort(new Error("Agent run lease lost"));
  });

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
  const toolsContext = {
    ...buildWorkspaceToolContext(workspaceId),
    ...buildRunToolContext(run.id, workspaceId),
  };
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
    } finally {
      try {
        await lease.release();
      } catch (error) {
        console.error(`[session] Failed to release lease for run ${run.id}:`, error);
      }
    }
  };

  const persistTranscript = async (messages: any[]) => {
    return withSessionLock(sessionId, () =>
      repo.updateSessionMessagesWithLease({
        workspaceId,
        sessionId,
        ownerId: lease.ownerId,
        sessionVersion: lease.sessionVersion,
        chatMessages: JSON.stringify(messages),
      }),
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
    const result = await createAgentRunner({
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
      abortSignal: cancellation.signal,
      onFinish: async ({ text }: any) => {
        recordTerminalOutcome(
          leaseLost
            ? { status: "recovery_required", errorMessage: "运行租约丢失，等待恢复器检查" }
            : {
                status: "completed",
                outputText: typeof text === "string" && text.length > 0 ? text : null,
              },
        );
      },
      onAbort: async () => {
        recordTerminalOutcome(
          leaseLost
            ? { status: "recovery_required", errorMessage: "运行租约丢失，等待恢复器检查" }
            : { status: "cancelled" },
        );
      },
      onError: async (error: any) => {
        const errorMessage = formatAIError(error);
        console.error(`[session] AI stream error for run ${run.id}: ${errorMessage}`);
        recordTerminalOutcome({
          status: "failed",
          errorMessage,
        });
      },
      onEnd: async ({ messages: newMessages, isAborted }) => {
        let outcome: {
          status: string;
          outputText?: string | null;
          errorMessage?: string;
        } =
          terminalOutcome ??
          (leaseLost
            ? { status: "recovery_required", errorMessage: "运行租约丢失，等待恢复器检查" }
            : isAborted
              ? { status: "cancelled" }
              : { status: "failed", errorMessage: "对话流未正常结束" });
        const generatedMessages = newMessages.slice(resolvedMessages.length);
        const completedTranscript = removeEmptyAssistantMessages([
          ...transcript,
          ...generatedMessages,
        ]);

        try {
          const transcriptPersisted = await persistTranscript(completedTranscript);
          if (!transcriptPersisted) {
            outcome = {
              status: "recovery_required",
              errorMessage: "运行租约已失效，未覆盖后续会话消息",
            };
          }
        } catch (error) {
          console.error(`[session] Failed to persist transcript for run ${run.id}:`, error);
          outcome = {
            status: "persistence_failed",
            errorMessage: "会话消息持久化失败，需要恢复后再继续",
          };
        }

        try {
          scheduleSessionTitleGeneration(workspaceId, sessionId, inputText);
        } finally {
          await finalizeRunOnce(outcome);
        }
      },
    }).run();
    void result.completion.finally(() => cancellation.close());
    return { stream: result.stream, runId: run.id };
  } catch (error) {
    cancellation.close();
    await finalizeRunOnce({
      status: "failed",
      errorMessage: formatAIError(error),
    });
    throw error;
  }
}
