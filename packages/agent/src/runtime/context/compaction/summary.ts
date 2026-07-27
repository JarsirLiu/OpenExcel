import { z } from "zod";
import { defaultTokenEstimator, type TokenEstimator } from "../../../session/tokenBudget.js";
import { ContextCompactionError, type ContextSummary } from "./types.js";

const MAX_SUMMARY_ITEMS = 64;
const MAX_SUMMARY_FIELD_LENGTH = 4_000;
const MAX_REFERENCE_FIELD_LENGTH = 1_000;

export const contextSummarySchema = z
  .object({
    goal: z.array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH)).max(MAX_SUMMARY_ITEMS),
    constraints: z
      .array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH))
      .max(MAX_SUMMARY_ITEMS),
    completed: z
      .array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH))
      .max(MAX_SUMMARY_ITEMS),
    inProgress: z
      .array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH))
      .max(MAX_SUMMARY_ITEMS),
    blocked: z.array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH)).max(MAX_SUMMARY_ITEMS),
    decisions: z
      .array(
        z.object({
          decision: z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH),
          reason: z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH).optional(),
        }),
      )
      .max(MAX_SUMMARY_ITEMS),
    nextSteps: z
      .array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH))
      .max(MAX_SUMMARY_ITEMS),
    criticalFacts: z
      .array(z.string().trim().min(1).max(MAX_SUMMARY_FIELD_LENGTH))
      .max(MAX_SUMMARY_ITEMS),
    references: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(MAX_REFERENCE_FIELD_LENGTH),
          value: z.string().trim().min(1).max(MAX_REFERENCE_FIELD_LENGTH),
        }),
      )
      .max(MAX_SUMMARY_ITEMS),
  })
  .strict();

export function validateContextSummary(
  value: unknown,
  maxTokens: number,
  estimator: TokenEstimator = defaultTokenEstimator,
): ContextSummary {
  const parsed = contextSummarySchema.safeParse(value);
  if (!parsed.success) {
    throw new ContextCompactionError(
      "Summary generator returned an invalid context summary",
      "summary",
      { cause: parsed.error },
    );
  }

  if (estimator.estimate(parsed.data) > maxTokens) {
    throw new ContextCompactionError(
      "Generated context summary exceeds the configured token budget",
      "summary",
    );
  }
  return parsed.data;
}
