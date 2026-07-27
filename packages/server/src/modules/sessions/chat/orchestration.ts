import {
  AgentPersistenceError,
  appendTranscriptEntry,
  createAgentRunner,
  DEFAULT_CONTEXT_COMPACTION_POLICY,
  formatAIError,
  type ToolExecutionRequest,
  type ToolExecutor,
  ToolResultBudget,
  toModelSafeJsonValue,
  wrapToolExecutorWithResultBudget,
} from "@openexcel/agent";
import type { ExcelToolName } from "@openexcel/core";
import { buildExcelToolCatalog } from "@openexcel/core";
import { loadModelConfig } from "../../../config.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import {
  buildToolContexts,
  type ServerToolRegistry,
  type ToolContextMap,
} from "../../../shared/tools/registry.js";
import { type ChatTurnRequest, toCanonicalUserMessage } from "../application/chatTurn.js";
import { extractMessageText } from "../application/messageText.js";
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as repo from "../infrastructure/sessionRepository.js";
import {
  createAgentPersistenceBarrier,
  createIdempotentToolExecutor,
} from "../runs/agentPersistence.js";
import { registerRunCancellation } from "../runs/cancellation.js";
import { createRunContextCheckpointStore } from "../runs/checkpointRepository.js";
import { createRunFinalizer } from "../runs/runFinalizer.js";
import { type AcquiredRunLease, acquireRunLease } from "../runs/runLease.js";
import { clearSessionUndoCheckpoint } from "../runs/undoCheckpoint.js";
import { createAgentEventStream } from "./agentEventStream.js";
import { loadWorkspaceChatContext } from "./context.js";
import { resolveChatMessageReferences } from "./references.js";
import { serverToolRegistry } from "./toolRegistry.js";

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
        appendTranscriptEntry(canonicalTranscript, toCanonicalUserMessage(turn)),
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

  const toolsContext = buildToolContexts(workspaceId, runId);
  const toolDefinitions = Object.values(serverToolRegistry).map(
    ({ name, description, inputSchema }) => ({
      name,
      description,
      inputSchema,
    }),
  );

  return { toolResultBudget, toolsContext, toolDefinitions };
}

export function createConcreteToolExecutor(
  tools: ServerToolRegistry,
  toolsContext: ToolContextMap,
): ToolExecutor {
  return {
    execute: async ({
      toolName,
      input,
      toolCallId,
      abortSignal,
      context: requestContext,
    }: ToolExecutionRequest) => {
      const tool = tools[toolName as ExcelToolName];
      if (!tool) {
        throw new Error(`Tool ${toolName} is not executable`);
      }
      const executionContext = requestContext as
        | {
            toolContexts?: Record<string, unknown>;
            db?: Prisma.TransactionClient;
            resultBudget?: { maxTokens: number; policy: "generic" | "paged-structured" };
          }
        | undefined;
      const baseContext = executionContext?.toolContexts?.[toolName] ?? toolsContext[tool.name];
      const parsedInput = tool.inputSchema.safeParse(input);
      if (!parsedInput.success) {
        throw new Error(
          `${toolName}: 输入参数验证失败: ${parsedInput.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      const parsedContext = tool.contextSchema.safeParse(baseContext);
      if (!parsedContext.success) {
        throw new Error(
          `${toolName}: 执行上下文验证失败: ${parsedContext.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      const output = await tool.execute(parsedInput.data, {
        toolCallId,
        abortSignal,
        context: parsedContext.data,
        db: executionContext?.db,
        resultBudget: executionContext?.resultBudget,
      });
      const parsedOutput = tool.outputSchema.safeParse(output);
      if (!parsedOutput.success) {
        throw new Error(
          `${toolName}: 输出结果验证失败: ${parsedOutput.error.issues
            .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
            .join("; ")}`,
        );
      }
      return toModelSafeJsonValue(parsedOutput.data);
    },
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
  const transcript = lease.transcript;
  const eventStream = createAgentEventStream();
  const finalizer = createRunFinalizer({
    workspaceId,
    sessionId,
    lease,
    eventSink: eventStream.sink,
  });
  let cancellation: ReturnType<typeof registerRunCancellation> | undefined;
  let leaseLost = false;

  try {
    await clearSessionUndoCheckpoint(workspaceId, sessionId);
    cancellation = registerRunCancellation(lease.run.id);
    const runCancellation = cancellation;
    lease.startHeartbeat(() => {
      leaseLost = true;
      runCancellation.abort(new Error("Agent run lease lost"));
    });

    const { toolResultBudget, toolsContext, toolDefinitions } = buildRunToolset(
      config,
      workspaceId,
      lease.run.id,
    );
    const toolNames = Object.keys(serverToolRegistry) as ExcelToolName[];
    const executionContext = {
      toolContexts: toolsContext,
      resultBudget: toolResultBudget,
      workspaceId,
    };
    const concreteToolExecutor = createConcreteToolExecutor(serverToolRegistry, toolsContext);
    const toolExecutor = wrapToolExecutorWithResultBudget(
      createIdempotentToolExecutor(lease.run.id, concreteToolExecutor),
      toolResultBudget,
    );

    const workspace = await loadWorkspaceChatContext(workspaceId);
    const resolvedMessages = transcript.map((entry) => ({
      ...entry,
      message: resolveChatMessageReferences([entry.message], workspace.workbooks)[0],
    }));

    const result = await createAgentRunner({
      modelConfig: config,
      turnId: turn.message.id,
      transcript: resolvedMessages,
      workspace: workspace.workbooks,
      maxRetries: config.maxRetries,
      contextWindowTokens: config.contextWindowTokens,
      outputReserveTokens: config.outputReserveTokens,
      compaction: {
        ...DEFAULT_CONTEXT_COMPACTION_POLICY,
        outputReserveTokens: config.outputReserveTokens,
      },
      compactionContextKey: `session:${sessionId}`,
      compactionCheckpointStore: createRunContextCheckpointStore(
        lease.run.id,
        `session:${sessionId}`,
        workspaceId,
        sessionId,
      ),
      maxConversationTurns: config.maxConversationTurns,
      maxUserInputTokens: config.maxUserInputTokens,
      timeout: {
        totalMs: config.timeoutMs,
        toolMs: config.timeoutMs,
      },
      tools: toolDefinitions,
      toolCatalog: buildExcelToolCatalog(toolDefinitions.map((tool) => tool.name)),
      toolExecutor,
      executionContext,
      persistenceBarrier: createAgentPersistenceBarrier(lease.run.id),
      eventSink: eventStream.sink,
      prepareStep: async () => ({
        activeTools: toolNames.filter((name) => !toolResultBudget.isToolExhausted(name)),
      }),
      abortSignal: runCancellation.signal,
    }).run();

    const settlement = result.completion
      .then(async (completion) => {
        await finalizer.finalize({ completion, leaseLost });
      })
      .catch(async (error) => {
        const cancelled = runCancellation.signal.aborted;
        await finalizer.finalize({
          status: cancelled
            ? "cancelled"
            : error instanceof AgentPersistenceError
              ? "recovery_required"
              : "failed",
          errorMessage: cancelled ? undefined : formatAIError(error),
          leaseLost,
        });
      })
      .finally(() => {
        runCancellation.close();
      });

    void settlement.then(
      () => eventStream.close(),
      (error) => eventStream.fail(error),
    );

    return { stream: eventStream.stream, runId: lease.run.id };
  } catch (error) {
    cancellation?.close();
    eventStream.fail(error);
    await finalizer.finalize({
      status: error instanceof AgentPersistenceError ? "recovery_required" : "failed",
      errorMessage: formatAIError(error),
      leaseLost,
    });
    throw error;
  }
}
