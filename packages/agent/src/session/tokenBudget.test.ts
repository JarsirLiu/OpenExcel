import { describe, expect, it } from "vitest";
import { normalizeModelStepUsage, type TokenEstimator, TokenUsageTracker } from "./tokenBudget.js";

const estimator: TokenEstimator = {
  estimate(value) {
    return JSON.stringify(value).length;
  },
};

function context(message: string) {
  return {
    messages: [{ role: "user", content: message }],
    systemPrompt: "system",
    toolDefinitions: [],
  };
}

describe("normalizeModelStepUsage", () => {
  it("normalizes AI SDK usage and nested cache details", () => {
    expect(
      normalizeModelStepUsage({
        inputTokens: 120,
        outputTokens: 30,
        totalTokens: 150,
        inputTokenDetails: { cacheReadTokens: 80 },
      }),
    ).toEqual({
      inputTokens: 120,
      outputTokens: 30,
      totalTokens: 150,
      cacheReadTokens: 80,
      source: "provider",
    });
  });

  it("requires input tokens but accepts partial provider usage", () => {
    expect(normalizeModelStepUsage({ promptTokens: 12, completionTokens: 4 })).toBeUndefined();
    expect(normalizeModelStepUsage({ inputTokens: 12 })).toEqual({
      inputTokens: 12,
      source: "provider",
    });
    expect(normalizeModelStepUsage({ outputTokens: 4 })).toBeUndefined();
    expect(normalizeModelStepUsage({ inputTokens: -1, outputTokens: 4 })).toBeUndefined();
  });
});

describe("TokenUsageTracker", () => {
  it("uses the provider usage as the confirmed baseline", () => {
    const tracker = new TokenUsageTracker(estimator);
    const first = tracker.recordStepFinished(
      {
        stepIndex: 0,
        usage: { inputTokens: 100, outputTokens: 10, source: "provider" },
        finishReason: "stop",
      },
      context("a"),
    );
    const next = tracker.predict(context("ab"));

    expect(first.observation).toMatchObject({ inputTokens: 100, source: "provider" });
    expect(next.observation).toMatchObject({ source: "mixed", inputTokens: 101 });
    expect(next.confirmedInputTokens).toBe(100);
    expect(next.estimatedDeltaTokens).toBe(1);
  });

  it("does not double count multiple estimates before the next provider callback", () => {
    const tracker = new TokenUsageTracker(estimator);
    tracker.recordStepFinished(
      {
        stepIndex: 0,
        usage: { inputTokens: 100, outputTokens: 10, source: "provider" },
        finishReason: "tool-call",
      },
      context("a"),
    );

    tracker.predict(context("ab"));
    const next = tracker.predict(context("abc"));

    expect(next.observation.inputTokens).toBe(102);
  });

  it("starts a new estimate baseline after compaction", () => {
    const tracker = new TokenUsageTracker(estimator);
    tracker.recordStepFinished(
      {
        stepIndex: 2,
        usage: { inputTokens: 900, outputTokens: 40, source: "provider" },
        finishReason: "stop",
      },
      context("very old history"),
    );
    tracker.resetAfterCompaction();

    const next = tracker.predict(context("summary plus recent history"));

    expect(next.observation.source).toBe("estimate");
    expect(next.confirmedInputTokens).toBeUndefined();
    expect(next.contextRevision).toBe(1);
  });

  it("corrects an estimate immediately when provider usage arrives", () => {
    const tracker = new TokenUsageTracker(estimator);
    tracker.recordStepFinished(
      {
        stepIndex: 0,
        usage: { inputTokens: 100, outputTokens: 10, source: "provider" },
        finishReason: "tool-call",
      },
      context("a"),
    );
    tracker.predict(context("ab"));

    const corrected = tracker.recordStepFinished(
      {
        stepIndex: 1,
        usage: { inputTokens: 180, outputTokens: 12, source: "provider" },
        finishReason: "stop",
      },
      context("ab"),
    );

    expect(corrected.observation).toMatchObject({
      inputTokens: 180,
      source: "provider",
      measuredAtStep: 1,
    });
  });

  it("uses partial provider input usage as the next confirmed baseline", () => {
    const tracker = new TokenUsageTracker(estimator);
    const result = tracker.recordStepFinished(
      {
        stepIndex: 0,
        usage: { inputTokens: 120, source: "provider" },
        finishReason: "stop",
      },
      context("a"),
    );

    expect(result.observation).toMatchObject({ inputTokens: 120, source: "provider" });
    expect(tracker.predict(context("ab")).observation.inputTokens).toBe(121);
  });
});
