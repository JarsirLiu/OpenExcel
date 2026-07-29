import type { OrderedAgentEventEmitter } from "../events/orderedEmitter.js";
import { AgentProtocolError } from "../events/types.js";

type EventEmitter = Pick<OrderedAgentEventEmitter, "emit">;
export type ToolFinishSource = "adapter" | "provider" | "reconciliation" | "terminal";

export interface ToolCallLifecycleOptions {
  turnId?: string;
  emitter: EventEmitter;
  getStepIndex: () => number;
}

export interface ToolCallLifecycle {
  start(event: { toolName: string; toolCallId: string; input?: unknown }): Promise<void>;
  finish(event: {
    toolName: string;
    toolCallId: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    source?: ToolFinishSource;
  }): Promise<void>;
  reconcileStep(step: unknown): Promise<void>;
  finishPending(error: unknown): Promise<number>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toolCallIdOf(value: Record<string, unknown>) {
  const toolCallId = value.toolCallId ?? value.id;
  return typeof toolCallId === "string" && toolCallId.length > 0 ? toolCallId : undefined;
}

function errorMessageOf(value: Record<string, unknown>) {
  const candidate = value.error;
  const error = asRecord(candidate);
  return (
    (typeof value.errorText === "string" && value.errorText) ||
    (typeof error.message === "string" && error.message) ||
    (candidate instanceof Error && candidate.message) ||
    (typeof candidate === "string" && candidate) ||
    "工具调用参数无效"
  );
}

function modelToolErrorOf(value: unknown) {
  const output = asRecord(value);
  return output.isError === true && Object.hasOwn(output, "error") ? output.error : undefined;
}

function lifecycleErrorOf(value: unknown) {
  if (!(value instanceof Error)) return value;
  const record = value as Error & {
    kind?: unknown;
    details?: unknown;
    retryable?: unknown;
  };
  return {
    kind: typeof record.kind === "string" ? record.kind : "internal_error",
    message: value.message,
    ...(record.details && typeof record.details === "object" ? { details: record.details } : {}),
    ...(typeof record.retryable === "boolean" ? { retryable: record.retryable } : {}),
    ...(value.name !== "Error" ? { name: value.name } : {}),
  };
}

export function createToolCallLifecycle(options: ToolCallLifecycleOptions): ToolCallLifecycle {
  const assistantMessageId = `${options.turnId ?? "run"}-assistant`;
  const startedToolCalls = new Map<string, { toolName: string; input?: unknown }>();
  const finishedToolCallIds = new Set<string>();

  async function start(event: { toolName: string; toolCallId: string; input?: unknown }) {
    const existing = startedToolCalls.get(event.toolCallId);
    if (existing) {
      if (event.input !== undefined) existing.input = event.input;
      return;
    }
    startedToolCalls.set(event.toolCallId, {
      toolName: event.toolName,
      ...(event.input !== undefined ? { input: event.input } : {}),
    });
    await options.emitter.emit("tool.started", {
      ...event,
      turnId: options.turnId,
      stepIndex: options.getStepIndex(),
      messageId: assistantMessageId,
    });
  }

  async function finish(event: {
    toolName: string;
    toolCallId: string;
    input?: unknown;
    output?: unknown;
    error?: unknown;
    source?: ToolFinishSource;
  }) {
    if (finishedToolCallIds.has(event.toolCallId)) return;
    await start({
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      ...(event.input !== undefined ? { input: event.input } : {}),
    });
    finishedToolCallIds.add(event.toolCallId);
    const hasError = event.error !== undefined;
    const started = startedToolCalls.get(event.toolCallId);
    await options.emitter.emit("tool.finished", {
      toolName: event.toolName,
      toolCallId: event.toolCallId,
      ...(event.input !== undefined
        ? { input: event.input }
        : started?.input !== undefined
          ? { input: started.input }
          : {}),
      outcome: hasError ? "failed" : "completed",
      ...(event.source ? { source: event.source } : {}),
      ...(hasError ? { error: lifecycleErrorOf(event.error) } : { output: event.output }),
      turnId: options.turnId,
      stepIndex: options.getStepIndex(),
      messageId: assistantMessageId,
    });
  }

  async function reconcileStep(step: unknown) {
    const value = asRecord(step);
    const toolCalls = Array.isArray(value.toolCalls) ? value.toolCalls : [];
    const toolResults = Array.isArray(value.toolResults) ? value.toolResults : [];
    const resultsById = new Map<string, Record<string, unknown>>();

    for (const candidate of toolResults) {
      const result = asRecord(candidate);
      const toolCallId = toolCallIdOf(result);
      if (toolCallId) resultsById.set(toolCallId, result);
    }

    for (const candidate of toolCalls) {
      const call = asRecord(candidate);
      const toolCallId = toolCallIdOf(call);
      const toolName = typeof call.toolName === "string" ? call.toolName : undefined;
      if (!toolCallId || !toolName) {
        throw new AgentProtocolError("Completed model step contains an invalid tool call", {
          eventType: "step.finished",
          details: { toolCall: call },
        });
      }

      await start({ toolName, toolCallId, input: call.input });
      if (finishedToolCallIds.has(toolCallId)) continue;

      const result = resultsById.get(toolCallId);
      if (!result) {
        await finish({
          toolName,
          toolCallId,
          input: call.input,
          error: {
            kind: "tool_protocol_error",
            message: "工具调用未返回结果",
            retryable: true,
          },
          source: "reconciliation",
        });
        throw new AgentProtocolError(`Tool call ${toolCallId} did not produce a result`, {
          eventType: "step.finished",
          details: { toolCallId, toolName },
        });
      }

      const modelError = modelToolErrorOf(result.output);
      const hasError =
        result.type === "tool-error" || result.error !== undefined || modelError !== undefined;
      const errorMessage = errorMessageOf(result);
      await finish({
        toolName,
        toolCallId,
        input: result.input ?? call.input,
        ...(hasError
          ? {
              error: {
                kind: "tool_call_failed",
                message:
                  modelError === undefined ? errorMessage : errorMessageOf({ error: modelError }),
                retryable: true,
              },
            }
          : { output: result.output }),
        source: "reconciliation",
      });
    }
  }

  async function finishPending(error: unknown) {
    let pendingCount = 0;
    for (const [toolCallId, toolCall] of startedToolCalls) {
      if (finishedToolCallIds.has(toolCallId)) continue;
      pendingCount += 1;
      await finish({
        toolName: toolCall.toolName,
        toolCallId,
        input: toolCall.input,
        error,
        source: "terminal",
      });
    }
    return pendingCount;
  }

  return { start, finish, reconcileStep, finishPending };
}
