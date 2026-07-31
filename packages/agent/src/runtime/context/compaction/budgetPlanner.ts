import type { ContextCompactionPolicy } from "./types.js";

export interface ContextBudgetPlan {
  regularInputBudget: number;
  conversationInputBudget: number;
  summaryInputBudget: number;
  fixedContextTokens: number;
  compactBefore: number;
}

export interface ContextBudgetPlanOptions {
  fixedContextTokens?: number;
  summaryFixedContextTokens?: number;
}

export function createContextBudgetPlan(
  contextWindowTokens: number,
  policy: ContextCompactionPolicy,
  options: ContextBudgetPlanOptions = {},
): ContextBudgetPlan {
  const contextWindow = positiveInteger(contextWindowTokens, "contextWindowTokens");
  const fixedContextTokens = nonNegativeInteger(
    options.fixedContextTokens ?? 0,
    "fixedContextTokens",
  );
  const summaryFixedTokens = nonNegativeInteger(
    options.summaryFixedContextTokens ?? 0,
    "summaryFixedContextTokens",
  );
  const regularInputBudget = Math.max(
    1,
    contextWindow - policy.outputReserveTokens - policy.safetyMarginTokens,
  );
  const conversationInputBudget = Math.max(1, regularInputBudget - fixedContextTokens);
  const summaryInputBudget = Math.max(
    1,
    contextWindow - policy.summaryMaxTokens - policy.safetyMarginTokens - summaryFixedTokens,
  );

  return {
    regularInputBudget,
    conversationInputBudget,
    summaryInputBudget,
    fixedContextTokens,
    compactBefore: Math.max(
      fixedContextTokens,
      Math.min(
        fixedContextTokens + Math.floor(conversationInputBudget * policy.triggerRatio),
        regularInputBudget,
      ),
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
