import type { AgentToolDefinition, ToolExecutor } from "../contracts.js";
import type { OrderedAgentEventEmitter } from "../events/orderedEmitter.js";
import { createAgentToolSet } from "../tools/toolAdapter.js";

type EventEmitter = Pick<OrderedAgentEventEmitter, "emit">;

export interface AgentStreamBridgeOptions {
  turnId?: string;
  tools: readonly AgentToolDefinition[];
  toolExecutor: ToolExecutor;
  executionContext: unknown;
  emitter: EventEmitter;
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
  onFinish(event: unknown): Promise<void>;
  onAbort(event: unknown): Promise<void>;
  onError(event: unknown): Promise<void>;
  getState(): AgentStreamBridgeState;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/** Adapts AI SDK stream/tool callbacks into ordered agent events and run state. */
export function createAgentStreamBridge(options: AgentStreamBridgeOptions): AgentStreamBridge {
  const assistantMessageId = `${options.turnId ?? "run"}-assistant`;
  const startedToolCallIds = new Set<string>();
  let streamedText = "";
  let streamedReasoning = "";
  const state: AgentStreamBridgeState = { aborted: false };

  async function emitToolStarted(event: { toolName: string; toolCallId: string; input?: unknown }) {
    if (startedToolCallIds.has(event.toolCallId)) return;
    startedToolCallIds.add(event.toolCallId);
    await options.emitter.emit("tool.started", {
      ...event,
      turnId: options.turnId,
      stepIndex: options.getStepIndex(),
      messageId: assistantMessageId,
    });
  }

  const tools = createAgentToolSet(options.tools, options.toolExecutor, options.executionContext, {
    onToolFinish: async (event) => {
      await options.emitter.emit("tool.finished", {
        ...event,
        turnId: options.turnId,
        stepIndex: options.getStepIndex(),
        messageId: assistantMessageId,
      });
    },
  });

  return {
    tools,

    async onChunk(chunk) {
      const value = asRecord(chunk);
      if (value.type === "tool-input-start") {
        if (typeof value.toolName !== "string" || typeof value.id !== "string") return;
        await emitToolStarted({ toolName: value.toolName, toolCallId: value.id });
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

    async onFinish(event) {
      await options.onFinish?.({ text: asRecord(event).text });
    },

    async onAbort(event) {
      state.aborted = true;
      await options.onAbort?.(event);
    },

    async onError(event) {
      const error = asRecord(event).error;
      state.loopError = error;
      state.failurePhase = "model";
      await options.onError?.(error);
    },

    getState() {
      return { ...state };
    },
  };
}
