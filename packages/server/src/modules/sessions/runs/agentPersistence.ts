import {
  type AgentEvent,
  AgentPersistenceError,
  type PersistenceBarrier,
  type ToolExecutor,
} from "@openexcel/agent";
import { withDatabaseWriteLock } from "../../../infra/database/databaseConcurrency.js";
import { prisma } from "../../../infra/database/db.js";
import { withWorkspaceUndoLock } from "../infrastructure/workspaceUndoLock.js";
import { type PersistedAgentStep, persistAgentEvent } from "./agentEventRepository.js";
import {
  claimToolExecutionUsing,
  completeToolExecution,
  completeToolExecutionUsing,
  failToolExecution,
  failToolExecutionUsing,
  ToolExecutionConflictError,
} from "./toolExecutionRepository.js";

function serializeJson(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify(String(value));
  }
}

function stepFromEvent(event: AgentEvent): PersistedAgentStep | undefined {
  if (event.type !== "step.finished") return undefined;
  const step = event.payload as Record<string, unknown>;
  const toolCalls = Array.isArray(step.toolCalls) ? step.toolCalls : [];
  const toolResults = Array.isArray(step.toolResults) ? step.toolResults : [];
  return {
    type: String(step.stepType ?? "step"),
    status: toolResults.some((result) => (result as Record<string, unknown>)?.isError)
      ? "error"
      : String(step.finishReason ?? "completed"),
    content: typeof step.text === "string" ? step.text : null,
    toolName:
      toolCalls
        .map((call) => (call as Record<string, unknown>)?.toolName)
        .filter((name): name is string => typeof name === "string" && name.length > 0)
        .join(",") || null,
    input: serializeJson(toolCalls),
    output: serializeJson(toolResults),
    order: event.sequence,
  };
}

export function createAgentPersistenceBarrier(runId: number): PersistenceBarrier {
  return {
    persist: async (event) => {
      await persistAgentEvent(runId, event, stepFromEvent(event));
    },
  };
}

export function createIdempotentToolExecutor(
  runId: number,
  executor: ToolExecutor,
  options: { isTransactionalTool: (toolName: string) => boolean },
): ToolExecutor {
  return {
    async execute(request) {
      const workspaceId =
        typeof request.context === "object" &&
        request.context !== null &&
        typeof (request.context as { workspaceId?: unknown }).workspaceId === "number"
          ? (request.context as { workspaceId: number }).workspaceId
          : undefined;
      if (!options.isTransactionalTool(request.toolName)) {
        const claim = await withDatabaseWriteLock(() =>
          prisma.$transaction((tx) =>
            claimToolExecutionUsing(tx, {
              runId,
              toolCallId: request.toolCallId,
              toolName: request.toolName,
              input: request.input,
            }),
          ),
        );
        if (claim.kind === "replay") return claim.output;

        let output: unknown;
        try {
          output = await executor.execute(request);
        } catch (error) {
          try {
            await withDatabaseWriteLock(() => failToolExecution(runId, request.toolCallId, error));
          } catch (persistenceError) {
            throw new AgentPersistenceError(persistenceError);
          }
          throw error;
        }

        try {
          await withDatabaseWriteLock(() =>
            completeToolExecution(runId, request.toolCallId, output),
          );
        } catch (error) {
          throw new AgentPersistenceError(error);
        }
        return output;
      }

      const executeMutation = () =>
        prisma.$transaction(async (tx) => {
          let claim: Awaited<ReturnType<typeof claimToolExecutionUsing>>;
          try {
            claim = await claimToolExecutionUsing(tx, {
              runId,
              toolCallId: request.toolCallId,
              toolName: request.toolName,
              input: request.input,
            });
          } catch (error) {
            if (error instanceof ToolExecutionConflictError) throw error;
            throw new AgentPersistenceError(error);
          }
          if (claim.kind === "replay") return { kind: "replay" as const, output: claim.output };

          let output: unknown;
          try {
            const context =
              typeof request.context === "object" && request.context !== null
                ? { ...(request.context as Record<string, unknown>), db: tx }
                : { db: tx };
            output = await executor.execute({ ...request, context });
          } catch (error) {
            try {
              await failToolExecutionUsing(tx, runId, request.toolCallId, error);
            } catch (persistenceError) {
              throw new AgentPersistenceError(persistenceError);
            }
            return { kind: "failed" as const, error };
          }

          try {
            await completeToolExecutionUsing(tx, runId, request.toolCallId, output);
          } catch (error) {
            throw new AgentPersistenceError(error);
          }
          return { kind: "completed" as const, output };
        });
      const execute = () => withDatabaseWriteLock(executeMutation);
      const result =
        workspaceId == null ? await execute() : await withWorkspaceUndoLock(workspaceId, execute);
      if (result.kind === "failed") throw result.error;
      return result.output;
    },
  };
}
