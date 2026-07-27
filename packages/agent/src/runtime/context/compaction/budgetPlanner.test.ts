import { describe, expect, it } from "vitest";
import { createContextBudgetPlan, shouldCompact } from "./budgetPlanner.js";
import { DEFAULT_CONTEXT_COMPACTION_POLICY } from "./types.js";

describe("createContextBudgetPlan", () => {
  it("reserves regular and summary output space independently", () => {
    const plan = createContextBudgetPlan(1_000, {
      ...DEFAULT_CONTEXT_COMPACTION_POLICY,
      triggerRatio: 0.8,
      outputReserveTokens: 200,
      summaryMaxTokens: 300,
      safetyMarginTokens: 50,
    });

    expect(plan).toEqual({
      regularInputBudget: 750,
      summaryInputBudget: 650,
      compactBefore: 600,
    });
    expect(shouldCompact(599, plan)).toBe(false);
    expect(shouldCompact(600, plan)).toBe(true);
  });

  it("rejects an invalid context window", () => {
    expect(() => createContextBudgetPlan(0, DEFAULT_CONTEXT_COMPACTION_POLICY)).toThrow(
      "contextWindowTokens",
    );
  });
});
