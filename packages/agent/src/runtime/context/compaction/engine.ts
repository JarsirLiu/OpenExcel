import {
  estimateFixedContextTokens,
  toEstimableToolDefinitions,
} from "../../../session/contextWindow.js";
import { defaultTokenEstimator, type TokenEstimator } from "../../../session/tokenBudget.js";
import { createContextSummaryMessage } from "../modelContextAssembler.js";
import {
  type ContextTranscriptEntry,
  messagesFromTranscript,
  validateTranscriptEntries,
} from "../transcript.js";
import { createContextBudgetPlan } from "./budgetPlanner.js";
import { selectSafeContextTail } from "./safeBoundary.js";
import { validateContextSummary } from "./summary.js";
import { planSummaryBatches } from "./summaryBatchPlanner.js";
import {
  type ContextCheckpoint,
  type ContextCompactionEngineOptions,
  ContextCompactionError,
  type ContextCompactionPolicy,
  type ContextSummary,
  DEFAULT_CONTEXT_COMPACTION_POLICY,
} from "./types.js";

export interface ContextCompactionRequest {
  contextKey: string;
  transcript: readonly ContextTranscriptEntry[];
  contextWindowTokens: number;
  modelContext?: {
    systemPrompt?: unknown;
    toolDefinitions?: unknown;
  };
  predictedInputTokens: number;
  externalContextRevision?: string;
  sourceRunId?: string;
  signal?: AbortSignal;
}

export interface ContextCompactionResult {
  checkpoint: ContextCheckpoint;
  previousSummary?: ContextSummary;
  recentEntries: readonly ContextTranscriptEntry[];
  compactedEntries: readonly ContextTranscriptEntry[];
  recentMessages: readonly unknown[];
  compactedMessages: readonly unknown[];
  recentStartIndex: number;
  predictedInputTokens: number;
}

export class ContextCompactionEngine {
  private readonly estimator: TokenEstimator;
  private readonly policy: ContextCompactionPolicy;
  private readonly now: () => Date;

  constructor(private readonly options: ContextCompactionEngineOptions) {
    this.estimator = options.estimator ?? defaultTokenEstimator;
    this.policy = {
      ...DEFAULT_CONTEXT_COMPACTION_POLICY,
      ...options.policy,
    };
    this.now = options.now ?? (() => new Date());
    validatePolicy(this.policy);
  }

  async compact(input: ContextCompactionRequest): Promise<ContextCompactionResult> {
    validateTranscriptEntries(input.transcript);

    const current = await this.options.checkpointStore.load(input.contextKey);
    const sameRevision =
      current === null || current.externalContextRevision === input.externalContextRevision;
    const previousSummary = sameRevision ? current?.summary : undefined;

    const selection = selectSafeContextTail(input.transcript, {
      keepRecentTokens: this.policy.keepRecentTokens,
      maxRecentTurns: this.policy.maxRecentTurns,
      estimator: this.estimator,
    });
    const coveredEntry = selection.compactedEntries.at(-1);
    if (!coveredEntry) {
      throw new ContextCompactionError(
        "No complete historical turn is available for compaction",
        "boundary",
      );
    }
    if (sameRevision && current && coveredEntry.cursor <= current.coveredTranscriptCursor) {
      throw new ContextCompactionError(
        "Compaction boundary must advance beyond the existing checkpoint",
        "checkpoint",
      );
    }

    const summarySource = selection.compactedEntries.filter(
      (entry) => !sameRevision || entry.cursor > (current?.coveredTranscriptCursor ?? -1),
    );
    if (summarySource.length === 0) {
      throw new ContextCompactionError(
        "No transcript entries exist after the previous compaction checkpoint",
        "boundary",
      );
    }

    const baseSystemPrompt = input.modelContext?.systemPrompt;

    const plan = createContextBudgetPlan(input.contextWindowTokens, this.policy, {
      fixedContextTokens: estimateFixedContextTokens({
        systemPrompt: baseSystemPrompt,
        toolDefinitions: input.modelContext?.toolDefinitions,
      }),
      summaryFixedContextTokens:
        this.options.summaryFixedContextTokens ??
        this.options.summaryGenerator.estimateFixedContextTokens?.({
          previousSummary,
          coveredTranscriptCursor: coveredEntry.cursor,
        }),
    });
    const summary = await this.generateSummary(
      input,
      previousSummary,
      summarySource,
      plan.summaryInputBudget,
    );

    const contextTokens = this.estimator.estimate({
      messages: [createContextSummaryMessage(summary), ...selection.recentMessages],
      systemPrompt: baseSystemPrompt,
      toolDefinitions: toEstimableToolDefinitions(input.modelContext?.toolDefinitions),
    });
    if (contextTokens > plan.regularInputBudget) {
      throw new ContextCompactionError(
        "Context remains above the regular input budget after compaction",
        "context_budget",
      );
    }

    const timestamp = this.now().toISOString();
    const version = (current?.version ?? 0) + 1;
    const checkpoint: ContextCheckpoint = {
      schemaVersion: 1,
      checkpointId: `${input.contextKey}:${version}`,
      contextKey: input.contextKey,
      version,
      coveredTranscriptCursor: coveredEntry.cursor,
      summaryVersion: (current?.summaryVersion ?? 0) + 1,
      summary,
      sourceTranscriptHash: this.options.sourceTranscriptHash(input.transcript),
      ...(input.externalContextRevision !== undefined
        ? { externalContextRevision: input.externalContextRevision }
        : {}),
      ...(input.sourceRunId !== undefined ? { sourceRunId: input.sourceRunId } : {}),
      createdAt: current?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };

    const saved = await this.options.checkpointStore.save({
      checkpoint,
      expectedVersion: current?.version ?? null,
    });
    if (!saved.accepted) {
      throw new ContextCompactionError("Context checkpoint version conflict", "checkpoint", {
        cause: saved.current,
      });
    }

    return {
      checkpoint,
      previousSummary,
      recentEntries: selection.recentEntries,
      compactedEntries: selection.compactedEntries,
      recentMessages: selection.recentMessages,
      compactedMessages: selection.compactedMessages,
      recentStartIndex: selection.recentStartIndex,
      predictedInputTokens: input.predictedInputTokens,
    };
  }

  private async generateSummary(
    input: ContextCompactionRequest,
    previousSummary: ContextSummary | undefined,
    sourceEntries: readonly ContextTranscriptEntry[],
    summaryInputBudget: number,
  ): Promise<ContextSummary> {
    let summary = previousSummary;
    try {
      let remainingEntries = [...sourceEntries];
      while (remainingEntries.length > 0) {
        const batch = planSummaryBatches({
          entries: remainingEntries,
          previousSummary: summary,
          summaryInputBudget,
          summaryFixedContextTokens:
            this.options.summaryGenerator.estimateFixedContextTokens?.({
              previousSummary: summary,
              coveredTranscriptCursor: remainingEntries[0]?.cursor ?? 0,
            }) ?? 0,
          estimator: this.estimator,
        })[0];
        if (!batch) {
          throw new ContextCompactionError("Summary batch planner produced no batch", "summary");
        }
        const generated = await this.options.summaryGenerator.generate({
          previousSummary: summary,
          messages: messagesFromTranscript(batch.entries),
          coveredTranscriptCursor: batch.coveredTranscriptCursor,
          signal: input.signal,
        });
        summary = validateContextSummary(generated, this.policy.summaryMaxTokens, this.estimator);
        remainingEntries = remainingEntries.slice(batch.entries.length);
      }
    } catch (error) {
      if (error instanceof ContextCompactionError) throw error;
      throw new ContextCompactionError("Context summary generation failed", "summary", {
        cause: error,
      });
    }
    if (!summary) {
      throw new ContextCompactionError("Summary generation produced no summary", "summary");
    }
    return summary;
  }
}

function validatePolicy(policy: ContextCompactionPolicy): void {
  if (policy.triggerRatio <= 0 || policy.triggerRatio > 1) {
    throw new RangeError("triggerRatio must be greater than 0 and at most 1");
  }
  for (const [name, value] of Object.entries(policy)) {
    if (name === "triggerRatio" || value === undefined) continue;
    if (!Number.isInteger(value) || value < 0) {
      throw new RangeError(`${name} must be a non-negative integer`);
    }
  }
  if (policy.keepRecentTokens === 0 || policy.summaryMaxTokens === 0) {
    throw new RangeError("summaryMaxTokens and keepRecentTokens must be positive");
  }
}
