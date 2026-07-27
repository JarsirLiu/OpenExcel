import type { ModelStepContext } from "../../session/modelStepContext.js";
import {
  type ModelStepBudgetEvent,
  normalizeModelStepUsage,
  type TokenUsageTracker,
} from "../../session/tokenBudget.js";
import type { OrderedAgentEventEmitter } from "../events/orderedEmitter.js";

type EventEmitter = Pick<OrderedAgentEventEmitter, "emit">;

export interface ModelStepObserverOptions {
  emitter: EventEmitter;
  tokenUsageTracker: TokenUsageTracker;
  modelStepContext: ModelStepContext;
  onModelStepFinished?: (event: ModelStepBudgetEvent) => void | Promise<void>;
}

export interface ModelStepObserver {
  getStepIndex(): number;
  onStepStart(step: unknown): Promise<void>;
  onStepFinish(step: unknown): Promise<void>;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function normalizeStepPayload(step: unknown) {
  const value = asRecord(step);
  const toolCalls = Array.isArray(value.toolCalls)
    ? value.toolCalls
        .map((call) => {
          if (!call || typeof call !== "object") return null;
          const toolCall = call as Record<string, unknown>;
          return {
            toolName: String(toolCall.toolName ?? "unknown"),
            toolCallId: String(toolCall.toolCallId ?? "unknown"),
          };
        })
        .filter((call): call is { toolName: string; toolCallId: string } => call !== null)
    : [];
  const toolResults = Array.isArray(value.toolResults)
    ? value.toolResults.map((result) => {
        const toolResult = asRecord(result);
        return {
          isError: "error" in toolResult || Boolean(toolResult.isError),
        };
      })
    : [];

  return {
    stepType: toolCalls.length > 0 ? "tool-call" : toolResults.length > 0 ? "tool-result" : "text",
    finishReason: String(value.finishReason ?? "stop"),
    ...(typeof value.text === "string" ? { text: value.text } : {}),
    ...(toolCalls.length > 0 ? { toolCalls } : {}),
    ...(toolResults.length > 0 ? { toolResults } : {}),
  };
}

function resolveStepIndex(value: unknown, fallback: number): number {
  const candidate = asRecord(value).stepNumber;
  return typeof candidate === "number" ? candidate : fallback;
}

/** Converts AI SDK step lifecycle callbacks into provider-neutral step events. */
export function createModelStepObserver(options: ModelStepObserverOptions): ModelStepObserver {
  let currentStepIndex = 0;

  return {
    getStepIndex() {
      return currentStepIndex;
    },

    async onStepStart(step) {
      currentStepIndex = resolveStepIndex(step, currentStepIndex + 1);
      const value = asRecord(step);
      const prediction = options.tokenUsageTracker.predict(
        options.modelStepContext.startStep({
          messages: value.messages,
          instructions: value.instructions,
          activeTools: Array.isArray(value.activeTools) ? value.activeTools.map(String) : undefined,
        }),
      );
      await options.emitter.emit("step.started", {
        stepNumber: currentStepIndex,
        tokenObservation: prediction.observation,
        estimatedContextTokens: prediction.estimatedContextTokens,
      });
    },

    async onStepFinish(step) {
      const value = asRecord(step);
      const finishedStepIndex = resolveStepIndex(step, currentStepIndex);
      const usage = normalizeModelStepUsage(value.usage);
      const request = asRecord(value.request);
      const budget = options.tokenUsageTracker.recordStepFinished(
        {
          stepIndex: finishedStepIndex,
          usage,
          finishReason: String(value.finishReason ?? "stop"),
        },
        options.modelStepContext.finishStep({ messages: request.messages }),
      );
      const stepBudget: ModelStepBudgetEvent = {
        stepIndex: finishedStepIndex,
        usage,
        finishReason: String(value.finishReason ?? "stop"),
        observation: budget.observation,
        estimatedContextTokens: budget.estimatedContextTokens,
      };
      await options.emitter.emit("step.finished", {
        ...normalizeStepPayload(step),
        tokenObservation: stepBudget.observation,
        estimatedContextTokens: stepBudget.estimatedContextTokens,
      });
      await options.onModelStepFinished?.(stepBudget);
    },
  };
}
