import { estimateTokens } from "./contextWindow.js";

export type TokenObservationSource = "provider" | "estimate" | "mixed";

export interface ModelStepUsage {
  inputTokens: number;
  outputTokens?: number;
  totalTokens?: number;
  cacheReadTokens?: number;
  reasoningTokens?: number;
  source: "provider";
}

export interface ModelStepFinished {
  stepIndex: number;
  usage?: ModelStepUsage;
  finishReason: string;
}

export interface TokenContextSnapshot {
  messages: unknown;
  systemPrompt?: unknown;
  toolDefinitions?: unknown;
  pendingToolResults?: unknown;
}

export interface TokenEstimator {
  estimate(value: unknown): number;
}

export const defaultTokenEstimator: TokenEstimator = {
  estimate: estimateTokens,
};

export interface TokenObservation {
  inputTokens: number;
  source: TokenObservationSource;
  measuredAtStep?: number;
}

export interface TokenBudgetSnapshot {
  observation: TokenObservation;
  estimatedContextTokens: number;
  confirmedInputTokens?: number;
  estimatedDeltaTokens?: number;
  contextRevision: number;
}

export interface ModelStepBudgetEvent extends ModelStepFinished {
  observation: TokenObservation;
  estimatedContextTokens: number;
  responseMessages?: readonly unknown[];
}

function asNonNegativeInteger(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return undefined;
  return Math.ceil(value);
}

function readTokenCount(value: unknown, ...keys: string[]): number | undefined {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    const count = asNonNegativeInteger(record[key]);
    if (count !== undefined) return count;
  }
  return undefined;
}

/** Converts the AI SDK usage shape into the agent's provider-neutral shape. */
export function normalizeModelStepUsage(value: unknown): ModelStepUsage | undefined {
  const inputTokens = readTokenCount(value, "inputTokens");
  const outputTokens = readTokenCount(value, "outputTokens");
  if (inputTokens === undefined) return undefined;

  const totalTokens = readTokenCount(value, "totalTokens");
  const cacheReadTokens =
    readTokenCount(value, "cacheReadTokens") ??
    readTokenCount((value as Record<string, unknown>).inputTokenDetails, "cacheReadTokens") ??
    readTokenCount((value as Record<string, unknown>).promptTokenDetails, "cachedTokens");
  const reasoningTokens =
    readTokenCount(value, "reasoningTokens") ??
    readTokenCount((value as Record<string, unknown>).outputTokenDetails, "reasoningTokens");

  return {
    inputTokens,
    ...(outputTokens !== undefined ? { outputTokens } : {}),
    ...(totalTokens !== undefined ? { totalTokens } : {}),
    ...(cacheReadTokens !== undefined ? { cacheReadTokens } : {}),
    ...(reasoningTokens !== undefined ? { reasoningTokens } : {}),
    source: "provider",
  };
}

function estimateContext(context: TokenContextSnapshot, estimator: TokenEstimator): number {
  return Math.max(
    1,
    estimator.estimate({
      messages: context.messages,
      systemPrompt: context.systemPrompt,
      toolDefinitions: toEstimableToolDefinitions(context.toolDefinitions),
      pendingToolResults: context.pendingToolResults,
    }),
  );
}

function toEstimableToolDefinitions(value: unknown): unknown {
  if (!Array.isArray(value)) return value;

  return value.map((tool) => {
    if (!isRecord(tool) || !isRecord(tool.inputSchema)) return tool;
    const schema = tool.inputSchema as SchemaWithJsonSchema;
    if (typeof schema.toJSONSchema !== "function") return tool;

    try {
      return { ...tool, inputSchema: schema.toJSONSchema() };
    } catch {
      return { ...tool, inputSchema: { type: "object" } };
    }
  });
}

type SchemaWithJsonSchema = {
  toJSONSchema?: () => unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type ConfirmedBaseline = {
  inputTokens: number;
  contextTokens: number;
  stepIndex: number;
  contextRevision: number;
};

/**
 * Tracks provider-confirmed input usage and predicts the next request between
 * provider callbacks. It is intentionally independent from the agent loop and
 * must be reset after a successful compaction checkpoint.
 */
export class TokenUsageTracker {
  private baseline?: ConfirmedBaseline;
  private contextRevision = 0;

  constructor(private readonly estimator: TokenEstimator = defaultTokenEstimator) {}

  predict(context: TokenContextSnapshot): TokenBudgetSnapshot {
    const estimatedContextTokens = estimateContext(context, this.estimator);
    if (!this.baseline || this.baseline.contextRevision !== this.contextRevision) {
      return {
        observation: {
          inputTokens: estimatedContextTokens,
          source: "estimate",
        },
        estimatedContextTokens,
        contextRevision: this.contextRevision,
      };
    }

    const estimatedDeltaTokens = estimatedContextTokens - this.baseline.contextTokens;
    return {
      observation: {
        inputTokens: Math.max(0, this.baseline.inputTokens + estimatedDeltaTokens),
        source: "mixed",
        measuredAtStep: this.baseline.stepIndex,
      },
      estimatedContextTokens,
      confirmedInputTokens: this.baseline.inputTokens,
      estimatedDeltaTokens,
      contextRevision: this.contextRevision,
    };
  }

  recordStepFinished(step: ModelStepFinished, context: TokenContextSnapshot): TokenBudgetSnapshot {
    const estimatedContextTokens = estimateContext(context, this.estimator);
    const usage = step.usage;
    if (usage) {
      this.baseline = {
        inputTokens: usage.inputTokens,
        contextTokens: estimatedContextTokens,
        stepIndex: step.stepIndex,
        contextRevision: this.contextRevision,
      };
      return {
        observation: {
          inputTokens: usage.inputTokens,
          source: "provider",
          measuredAtStep: step.stepIndex,
        },
        estimatedContextTokens,
        confirmedInputTokens: usage.inputTokens,
        contextRevision: this.contextRevision,
      };
    }

    const predicted = this.predict(context);
    return {
      ...predicted,
      observation: {
        ...predicted.observation,
        measuredAtStep: step.stepIndex,
      },
    };
  }

  /** Invalidates usage measured before the current canonical context. */
  resetAfterCompaction(): void {
    this.contextRevision += 1;
    this.baseline = undefined;
  }
}
