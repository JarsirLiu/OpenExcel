import type { AgentToolDefinition, ToolExecutor } from "../contracts.js";
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
  failurePhase?: "model";
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

  const tools = createAgentToolSet(options.tools, options.toolExecutor, options.executionContext, {
    onToolStart: async (event) => {
      await toolLifecycle.start(event);
    },
    onToolFinish: async (event) => {
      await toolLifecycle.finish(event);
    },
  });

  return {
    tools,

    async onChunk(chunk) {
      const value = asRecord(chunk);
      if (value.type === "tool-input-start") {
        const toolCallId = value.toolCallId ?? value.id;
        if (typeof toolCallId !== "string" || typeof value.toolName !== "string") return;
        // Emit the visible tool node as soon as the model starts producing its
        // arguments. The completed input is attached by the execute/reconcile path.
        await toolLifecycle.start({
          toolName: value.toolName,
          toolCallId,
          input: {},
        });
      } else if (value.type === "text-delta") {
        if (typeof value.text !== "string") return;
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
        if (typeof value.text !== "string") return;
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
      await toolLifecycle.reconcileStep(step);
    },

    async finishPendingTools(error) {
      await toolLifecycle.finishPending(error);
    },

    async onFinish(event) {
      await toolLifecycle.finishPending({
        kind: "tool_protocol_error",
        message: "工具调用在模型响应结束时仍未完成",
        retryable: true,
      });
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
      state.loopError = error;
      state.failurePhase = "model";
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
