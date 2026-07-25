import {
  type AgentEvent,
  AgentPersistenceError,
  type PersistenceBarrier,
  type ToolExecutor,
} from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import { withWorkspaceUndoLock } from "../infrastructure/workspaceUndoLock.js";
import { type PersistedAgentStep, persistAgentEvent } from "./agentEventRepository.js";
import {
  claimToolExecutionUsing,
  completeToolExecutionUsing,
  failToolExecutionUsing,
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

export function createIdempotentToolExecutor(runId: number, executor: ToolExecutor): ToolExecutor {
  return {
    async execute(toolName, input, options) {
      const workspaceId =
        typeof options.context === "object" &&
        options.context !== null &&
        typeof (options.context as { workspaceId?: unknown }).workspaceId === "number"
          ? (options.context as { workspaceId: number }).workspaceId
          : undefined;
      const execute = () =>
        prisma.$transaction(async (tx) => {
          const claim = await claimToolExecutionUsing(tx, {
            runId,
            toolCallId: options.toolCallId,
            toolName,
            input,
          });
          if (claim.kind === "replay") return { kind: "replay" as const, output: claim.output };

          let output: unknown;
          try {
            const context =
              typeof options.context === "object" && options.context !== null
                ? { ...(options.context as Record<string, unknown>), db: tx }
                : { db: tx };
            output = await executor.execute(toolName, input, { ...options, context });
          } catch (error) {
            await failToolExecutionUsing(tx, runId, options.toolCallId, error);
            return { kind: "failed" as const, error };
          }

          try {
            await completeToolExecutionUsing(tx, runId, options.toolCallId, output);
          } catch (error) {
            throw new AgentPersistenceError(error);
          }
          return { kind: "completed" as const, output };
        });
      const result =
        workspaceId == null ? await execute() : await withWorkspaceUndoLock(workspaceId, execute);
      if (result.kind === "failed") throw result.error;
      return result.output;
    },
  };
}
