import type { AgentEvent, PersistenceBarrier, ToolExecutor } from "@openexcel/agent";
import { type PersistedAgentStep, persistAgentEvent } from "./agentEventRepository.js";
import {
  claimToolExecution,
  completeToolExecution,
  failToolExecution,
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
      const claim = await claimToolExecution({
        runId,
        toolCallId: options.toolCallId,
        toolName,
        input,
      });
      if (claim.kind === "replay") return claim.output;

      try {
        const output = await executor.execute(toolName, input, options);
        await completeToolExecution(runId, options.toolCallId, output);
        return output;
      } catch (error) {
        await failToolExecution(runId, options.toolCallId, error);
        throw error;
      }
    },
  };
}
