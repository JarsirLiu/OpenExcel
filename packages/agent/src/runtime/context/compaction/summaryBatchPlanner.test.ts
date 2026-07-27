import { describe, expect, it } from "vitest";
import { planSummaryBatches } from "./summaryBatchPlanner.js";

const estimator = { estimate: (value: unknown) => JSON.stringify(value).length };

describe("planSummaryBatches", () => {
  it("keeps complete turns in separate batches when the budget is reached", () => {
    const entries = [
      { cursor: 0, message: { role: "user", content: "first request" } },
      { cursor: 1, message: { role: "assistant", content: "first answer" } },
      { cursor: 2, message: { role: "user", content: "second request" } },
      { cursor: 3, message: { role: "assistant", content: "second answer" } },
    ];

    const batches = planSummaryBatches({
      entries,
      summaryInputBudget:
        Math.max(
          estimator.estimate({ previousSummary: undefined, messages: entries.slice(0, 2) }),
          estimator.estimate({ previousSummary: undefined, messages: entries.slice(2) }),
        ) + 1,
      estimator,
    });

    expect(batches.map((batch) => batch.entries)).toEqual([entries.slice(0, 2), entries.slice(2)]);
  });

  it("fails when a single complete turn exceeds the budget", () => {
    expect(() =>
      planSummaryBatches({
        entries: [
          { cursor: 0, message: { role: "user", content: "a very large request" } },
          { cursor: 1, message: { role: "assistant", content: "a very large answer" } },
        ],
        summaryInputBudget: 1,
        estimator,
      }),
    ).toThrow("complete transcript turn");
  });

  it("includes the summary request fixed context in every batch", () => {
    const entries = [
      { cursor: 0, message: { role: "user", content: "request" } },
      { cursor: 1, message: { role: "assistant", content: "answer" } },
    ];

    expect(() =>
      planSummaryBatches({
        entries,
        summaryInputBudget: estimator.estimate({ messages: entries }) + 5,
        summaryFixedContextTokens: 6,
        estimator,
      }),
    ).toThrow("complete transcript turn");
  });
});
