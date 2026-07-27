import type { ContextCompactionPolicy } from "./types.js";

export interface ContextBudgetPlan {
  regularInputBudget: number;
  summaryInputBudget: number;
  compactBefore: number;
}

export function createContextBudgetPlan(
  contextWindowTokens: number,
  policy: ContextCompactionPolicy,
  summaryFixedContextTokens = 0,
): ContextBudgetPlan {
  const contextWindow = positiveInteger(contextWindowTokens, "contextWindowTokens");
  const summaryFixedTokens = nonNegativeInteger(
    summaryFixedContextTokens,
    "summaryFixedContextTokens",
  );
  const regularInputBudget = Math.max(
    1,
    contextWindow - policy.outputReserveTokens - policy.safetyMarginTokens,
  );
  const summaryInputBudget = Math.max(
    1,
    contextWindow - policy.summaryMaxTokens - policy.safetyMarginTokens - summaryFixedTokens,
  );

  return {
    regularInputBudget,
    summaryInputBudget,
    compactBefore: Math.max(
      1,
      Math.min(Math.floor(regularInputBudget * policy.triggerRatio), regularInputBudget),
    ),
  };
}

export function shouldCompact(predictedInputTokens: number, plan: ContextBudgetPlan): boolean {
  return predictedInputTokens >= plan.compactBefore;
}

function positiveInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer`);
  }
  return value;
}

function nonNegativeInteger(value: number, name: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer`);
  }
  return value;
}
