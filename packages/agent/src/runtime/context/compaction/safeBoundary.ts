import { defaultTokenEstimator, type TokenEstimator } from "../../../session/tokenBudget.js";
import {
  type ContextTranscriptEntry,
  messagesFromTranscript,
  validateTranscriptEntries,
} from "../transcript.js";
import { groupTranscriptTurns } from "./turns.js";
import { ContextCompactionError } from "./types.js";

export interface SafeContextSelection {
  recentEntries: readonly ContextTranscriptEntry[];
  compactedEntries: readonly ContextTranscriptEntry[];
  recentMessages: readonly unknown[];
  compactedMessages: readonly unknown[];
  recentStartIndex: number;
  recentTokens: number;
}

export interface SafeContextSelectionOptions {
  keepRecentTokens: number;
  maxRecentTurns?: number;
  estimator?: TokenEstimator;
}

/**
 * Selects only complete user-led turns. A turn includes every message until
 * the next user message, so tool calls and their results cannot be separated.
 */
export function selectSafeContextTail(
  entries: readonly ContextTranscriptEntry[],
  options: SafeContextSelectionOptions,
): SafeContextSelection {
  const estimator = options.estimator ?? defaultTokenEstimator;
  validateTranscriptEntries(entries);
  if (!Number.isInteger(options.keepRecentTokens) || options.keepRecentTokens <= 0) {
    throw new RangeError("keepRecentTokens must be a positive integer");
  }

  const turns = groupTranscriptTurns(entries);
  if (turns.length === 0) {
    return {
      recentEntries: [],
      compactedEntries: [],
      recentMessages: [],
      compactedMessages: [],
      recentStartIndex: 0,
      recentTokens: 0,
    };
  }

  const maxTurns =
    options.maxRecentTurns === undefined
      ? Number.POSITIVE_INFINITY
      : Math.max(1, Math.floor(options.maxRecentTurns));
  const selected: ContextTranscriptEntry[] = [];
  let selectedStartIndex = entries.length;
  let selectedTurns = 0;

  for (let turnIndex = turns.length - 1; turnIndex >= 0; turnIndex -= 1) {
    const turn = turns[turnIndex];
    const turnTokens = estimator.estimate(messagesFromTranscript(turn.entries));
    if (selected.length > 0 && selectedTurns >= maxTurns) break;
    if (
      selected.length > 0 &&
      estimator.estimate([
        ...messagesFromTranscript(turn.entries),
        ...messagesFromTranscript(selected),
      ]) > options.keepRecentTokens
    ) {
      break;
    }
    if (selected.length === 0 && turnTokens > options.keepRecentTokens) {
      throw new ContextCompactionError(
        "The latest complete turn exceeds the recent context budget",
        "boundary",
      );
    }

    selected.unshift(...turn.entries);
    selectedStartIndex = turn.startIndex;
    selectedTurns += 1;
  }

  if (selected.length === 0) {
    throw new ContextCompactionError(
      "No complete turn fits in the recent context budget",
      "boundary",
    );
  }

  return {
    recentEntries: selected,
    compactedEntries: entries.slice(0, selectedStartIndex),
    recentMessages: messagesFromTranscript(selected),
    compactedMessages: messagesFromTranscript(entries.slice(0, selectedStartIndex)),
    recentStartIndex: selectedStartIndex,
    recentTokens: estimator.estimate(messagesFromTranscript(selected)),
  };
}
