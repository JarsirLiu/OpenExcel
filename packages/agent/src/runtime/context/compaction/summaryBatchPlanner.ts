import { defaultTokenEstimator, type TokenEstimator } from "../../../session/tokenBudget.js";
import { type ContextTranscriptEntry, validateTranscriptEntries } from "../transcript.js";
import { groupTranscriptTurns } from "./turns.js";
import { ContextCompactionError, type ContextSummary } from "./types.js";

export interface SummaryBatch {
  entries: readonly ContextTranscriptEntry[];
  coveredTranscriptCursor: number;
}

export function planSummaryBatches(input: {
  entries: readonly ContextTranscriptEntry[];
  previousSummary?: ContextSummary;
  summaryInputBudget: number;
  summaryFixedContextTokens?: number;
  estimator?: TokenEstimator;
}): SummaryBatch[] {
  const estimator = input.estimator ?? defaultTokenEstimator;
  if (!Number.isInteger(input.summaryInputBudget) || input.summaryInputBudget <= 0) {
    throw new RangeError("summaryInputBudget must be a positive integer");
  }
  validateTranscriptEntries(input.entries);
  const fixedContextTokens = input.summaryFixedContextTokens ?? 0;

  const turns = groupTranscriptTurns(input.entries);
  const batches: SummaryBatch[] = [];
  let current: ContextTranscriptEntry[] = [];

  for (const turn of turns) {
    const candidate = [...current, ...turn.entries];
    if (
      estimator.estimate({ previousSummary: input.previousSummary, messages: candidate }) +
        fixedContextTokens <=
      input.summaryInputBudget
    ) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      batches.push(createBatch(current));
      current = [];
    }

    if (
      estimator.estimate({ previousSummary: input.previousSummary, messages: turn.entries }) +
        fixedContextTokens >
      input.summaryInputBudget
    ) {
      throw new ContextCompactionError(
        "A complete transcript turn exceeds the summary input budget",
        "summary",
      );
    }
    current = [...turn.entries];
  }

  if (current.length > 0) batches.push(createBatch(current));
  return batches;
}

function createBatch(entries: readonly ContextTranscriptEntry[]): SummaryBatch {
  const coveredTranscriptCursor = entries.at(-1)?.cursor;
  if (coveredTranscriptCursor === undefined) {
    throw new ContextCompactionError("Summary batch cannot be empty", "summary");
  }
  return { entries, coveredTranscriptCursor };
}
