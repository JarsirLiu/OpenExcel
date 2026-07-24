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

export async function loadSessionForChat(sessionId: number, workspaceId: number) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("Session not found");
  return session;
}

export async function acquireChatRunLease(
  workspaceId: number,
  sessionId: number,
  turn: ChatTurnRequest,
  inputText: string,
  modelName: string,
): Promise<AcquiredRunLease> {
  return withSessionLock(sessionId, () =>
    acquireRunLease({
      workspaceId,
      sessionId,
      requestId: turn.requestId,
      inputText,
      model: modelName,
      appendUserTurn: (canonicalTranscript) =>
        appendChatTurn(canonicalTranscript as Array<Record<string, unknown>>, turn),
    }),
  );
}

export function buildRunToolset(
  config: ReturnType<typeof loadModelConfig>,
  workspaceId: number,
  runId: number,
) {
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

  const toolsContext = {
    ...buildWorkspaceToolContext(workspaceId),
    ...buildRunToolContext(runId, workspaceId),
  };

  return { tools, toolResultBudget, toolsContext };
}

export function createConcreteToolExecutor(
  tools: ReturnType<typeof buildRunToolset>["tools"],
  toolsContext: ReturnType<typeof buildRunToolset>["toolsContext"],
): ToolExecutor {
  return {
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
      const context = toolsContext[toolName];
      return tool.execute(input, {
        toolCallId: options.toolCallId,
        abortSignal: options.abortSignal,
        context,
      });
    },
  };
}

export function createRunPersistence(
  workspaceId: number,
  sessionId: number,
  lease: AcquiredRunLease,
) {
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
      await completeRunAndUpdateUndoCheckpoint(workspaceId, sessionId, lease.run.id, data);
    } catch (error) {
      console.error(`[session] Failed to finalize run ${lease.run.id}:`, error);
    } finally {
      try {
        await lease.release();
      } catch (error) {
        console.error(`[session] Failed to release lease for run ${lease.run.id}:`, error);
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

  return {
    finalizeRunOnce,
    persistTranscript,
    recordTerminalOutcome,
    getTerminalOutcome: () => terminalOutcome,
  };
}

export async function streamChat(workspaceId: number, sessionId: number, turn: ChatTurnRequest) {
  const config = loadModelConfig();
  const userMessage = toCanonicalUserMessage(turn);
  const inputText = extractMessageText(userMessage);

  const lease = await acquireChatRunLease(
    workspaceId,
    sessionId,
    turn,
    inputText,
    config.modelName,
  );
  const transcript = lease.transcript as Array<Record<string, unknown>>;
  const { finalizeRunOnce, persistTranscript, recordTerminalOutcome, getTerminalOutcome } =
    createRunPersistence(workspaceId, sessionId, lease);
  let cancellation: ReturnType<typeof registerRunCancellation> | undefined;

  try {
    await clearSessionUndoCheckpoint(workspaceId, sessionId);
    cancellation = registerRunCancellation(lease.run.id);
    const runCancellation = cancellation;
    let leaseLost = false;
    lease.startHeartbeat(() => {
      leaseLost = true;
      runCancellation.abort(new Error("Agent run lease lost"));
    });

    const { tools, toolResultBudget, toolsContext } = buildRunToolset(
      config,
      workspaceId,
      lease.run.id,
    );
    const toolNames = Object.keys(tools);
    const executionContext = { toolContexts: toolsContext, resultBudget: toolResultBudget };
    const concreteToolExecutor = createConcreteToolExecutor(tools, toolsContext);
    const toolExecutor = createIdempotentToolExecutor(lease.run.id, concreteToolExecutor);

    const workspace = await loadWorkspaceChatContext(workspaceId);
    const resolvedMessages = resolveChatMessageReferences(transcript, workspace.workbooks);

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
      persistenceBarrier: createAgentPersistenceBarrier(lease.run.id),
      prepareStep: async () => ({
        activeTools: toolNames.filter((name) => !toolResultBudget.isToolExhausted(name)) as any,
      }),
      abortSignal: runCancellation.signal,
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
        console.error(`[session] AI stream error for run ${lease.run.id}: ${errorMessage}`);
        recordTerminalOutcome({
          status: "failed",
          errorMessage,
        });
      },
      onEnd: async ({ messages: newMessages, isAborted }) => {
        let outcome =
          getTerminalOutcome() ??
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
          console.error(`[session] Failed to persist transcript for run ${lease.run.id}:`, error);
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

    void result.completion.finally(() => runCancellation.close());
    return { stream: result.stream, runId: lease.run.id };
  } catch (error) {
    cancellation?.close();
    await finalizeRunOnce({
      status: "failed",
      errorMessage: formatAIError(error),
    });
    throw error;
  }
}
