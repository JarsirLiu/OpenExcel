import type { AgentToolDefinition, ToolExecutor } from "../contracts.js";
import { AgentProtocolError } from "../events/types.js";
import { isToolError } from "../tools/errors.js";
import { createAgentToolSet } from "../tools/toolAdapter.js";
import { createToolCallLifecycle } from "./toolCallLifecycle.js";

export interface AgentStreamBridgeOptions {
  turnId?: string;
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  executionContext: unknown;
  emitter: Parameters<typeof createToolCallLifecycle>[0]["emitter"];
  getStepIndex: () => number;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
}

export interface AgentStreamBridgeState {
  aborted: boolean;
  loopError?: unknown;
  failurePhase?: "model" | "tool";
}

export interface AgentStreamBridge {
  tools: ReturnType<typeof createAgentToolSet>;
  onChunk(chunk: unknown): Promise<void>;
  reconcileStep(step: unknown): Promise<void>;
  finishPendingTools(error: unknown): Promise<void>;
  onFinish(event: unknown): Promise<void>;
  onAbort(event: unknown): Promise<void>;
  onError(event: unknown): Promise<void>;
  resetForRetry(): void;
  getState(): AgentStreamBridgeState;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function requiredString(value: Record<string, unknown>, key: string, eventType: string) {
  const candidate = value[key];
  if (typeof candidate === "string" && candidate.length > 0) return candidate;
  throw new AgentProtocolError(`AI SDK ${eventType} is missing ${key}`, {
    eventType,
    details: { key },
  });
}

function requiredProperty(value: Record<string, unknown>, key: string, eventType: string) {
  if (Object.hasOwn(value, key)) return value[key];
  throw new AgentProtocolError(`AI SDK ${eventType} is missing ${key}`, {
    eventType,
    details: { key },
  });
}

/** Adapts AI SDK stream/tool callbacks into ordered agent events and run state. */
export function createAgentStreamBridge(options: AgentStreamBridgeOptions): AgentStreamBridge {
  const assistantMessageId = `${options.turnId ?? "run"}-assistant`;
  const toolLifecycle = createToolCallLifecycle({
    turnId: options.turnId,
    emitter: options.emitter,
    getStepIndex: options.getStepIndex,
  });
  let streamedText = "";
  let streamedReasoning = "";
  const state: AgentStreamBridgeState = { aborted: false };

  function isCancellationResult(value: unknown) {
    return (
      value && typeof value === "object" && (value as Record<string, unknown>).kind === "cancelled"
    );
  }

  const tools = createAgentToolSet(options.tools, options.toolExecutor, options.executionContext, {
    onToolStart: async (event) => {
      await toolLifecycle.start(event);
    },
    onToolFinish: async (event) => {
      await toolLifecycle.finish(event);
      if (
        event.error !== undefined &&
        !isToolError(event.error) &&
        !isCancellationResult(event.error)
      ) {
        state.loopError = event.error;
        state.failurePhase = "tool";
      }
    },
  });

  return {
    tools,

    async onChunk(chunk) {
      const value = asRecord(chunk);
      if (value.type === "tool-input-start") {
        const toolCallId = value.toolCallId ?? value.id;
        if (typeof toolCallId !== "string" || toolCallId.length === 0) {
          throw new AgentProtocolError("AI SDK tool-input-start is missing toolCallId", {
            eventType: "tool-input-start",
          });
        }
        const toolName = requiredString(value, "toolName", "tool-input-start");
        await toolLifecycle.start({
          toolName,
          toolCallId,
          input: {},
        });
      } else if (value.type === "tool-input-error") {
        const toolCallId = requiredString(value, "toolCallId", "tool-input-error");
        const toolName = requiredString(value, "toolName", "tool-input-error");
        await toolLifecycle.start({
          toolName,
          toolCallId,
          input: requiredProperty(value, "input", "tool-input-error"),
        });
        await toolLifecycle.finish({
          toolName,
          toolCallId,
          input: value.input,
          error: {
            kind: "validation_failed",
            message: requiredString(value, "errorText", "tool-input-error"),
            retryable: false,
          },
          source: "provider",
        });
      } else if (value.type === "tool-input-available") {
        await toolLifecycle.start({
          toolName: requiredString(value, "toolName", "tool-input-available"),
          toolCallId: requiredString(value, "toolCallId", "tool-input-available"),
          input: requiredProperty(value, "input", "tool-input-available"),
        });
      } else if (value.type === "tool-call") {
        await toolLifecycle.start({
          toolName: requiredString(value, "toolName", "tool-call"),
          toolCallId: requiredString(value, "toolCallId", "tool-call"),
          input: value.input,
        });
      } else if (value.type === "tool-error") {
        await toolLifecycle.finish({
          toolName: requiredString(value, "toolName", "tool-error"),
          toolCallId: requiredString(value, "toolCallId", "tool-error"),
          input: value.input,
          error: requiredProperty(value, "error", "tool-error"),
          source: "provider",
        });
      } else if (value.type === "tool-result") {
        await toolLifecycle.finish({
          toolName: requiredString(value, "toolName", "tool-result"),
          toolCallId: requiredString(value, "toolCallId", "tool-result"),
          input: value.input,
          output: requiredProperty(value, "output", "tool-result"),
          source: "provider",
        });
      } else if (value.type === "text-delta") {
        if (typeof value.text !== "string") {
          throw new AgentProtocolError("AI SDK text-delta is missing text", {
            eventType: "text-delta",
          });
        }
        streamedText += value.text;
        await options.emitter.emit("message.delta", {
          turnId: options.turnId ?? "unknown",
          stepIndex: options.getStepIndex(),
          messageId: assistantMessageId,
          partId: `${options.turnId ?? "run"}-text-${options.getStepIndex()}`,
          delta: value.text,
          text: streamedText,
        });
      } else if (value.type === "reasoning-delta") {
        if (typeof value.text !== "string") {
          throw new AgentProtocolError("AI SDK reasoning-delta is missing text", {
            eventType: "reasoning-delta",
          });
        }
        streamedReasoning += value.text;
        await options.emitter.emit("reasoning.delta", {
          turnId: options.turnId ?? "unknown",
          stepIndex: options.getStepIndex(),
          messageId: assistantMessageId,
          partId: `${options.turnId ?? "run"}-reasoning-${options.getStepIndex()}`,
          delta: value.text,
          text: streamedReasoning,
        });
      }
    },

    async reconcileStep(step) {
      if (state.failurePhase === "tool" && state.loopError !== undefined) {
        throw state.loopError;
      }
      await toolLifecycle.reconcileStep(step);
    },

    async finishPendingTools(error) {
      await toolLifecycle.finishPending(error);
    },

    async onFinish(event) {
      const pendingCount = await toolLifecycle.finishPending({
        kind: "tool_protocol_error",
        message: "工具调用在模型响应结束时仍未完成",
        retryable: true,
      });
      if (pendingCount > 0) {
        const error = new AgentProtocolError(
          `Model stream finished with ${pendingCount} unresolved tool call${
            pendingCount === 1 ? "" : "s"
          }`,
          {
            eventType: "finish",
            details: { pendingToolCallCount: pendingCount },
          },
        );
        state.loopError = error;
        state.failurePhase = "tool";
        throw error;
      }
      await options.onFinish?.({ text: asRecord(event).text });
    },

    async onAbort(event) {
      state.aborted = true;
      await toolLifecycle.finishPending({
        kind: "cancelled",
        message: "工具执行已中断",
        retryable: false,
      });
      await options.onAbort?.(event);
    },

    async onError(event) {
      const error = asRecord(event).error;
      const toolFailureAlreadyRecorded =
        state.failurePhase === "tool" && state.loopError !== undefined;
      if (!toolFailureAlreadyRecorded) {
        state.loopError = error;
        state.failurePhase = "model";
      }
      await toolLifecycle.finishPending({
        kind: "model_stream_error",
        message: error instanceof Error ? error.message : String(error ?? "模型流处理失败"),
        retryable: true,
      });
      await options.onError?.(error);
    },

    resetForRetry() {
      state.aborted = false;
      state.loopError = undefined;
      state.failurePhase = undefined;
      streamedText = "";
      streamedReasoning = "";
    },

    getState() {
      return { ...state };
    },
  };
}
