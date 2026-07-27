import type { TokenEstimator } from "../../../session/tokenBudget.js";
import type { ContextTranscriptEntry, TranscriptCursor } from "../transcript.js";

export interface ContextCompactionPolicy {
  triggerRatio: number;
  safetyMarginTokens: number;
  outputReserveTokens: number;
  summaryMaxTokens: number;
  keepRecentTokens: number;
  maxRecentTurns?: number;
  maxCompactionRetries: number;
}

export const DEFAULT_CONTEXT_COMPACTION_POLICY: ContextCompactionPolicy = {
  triggerRatio: 0.85,
  safetyMarginTokens: 1_024,
  outputReserveTokens: 16_000,
  summaryMaxTokens: 8_192,
  keepRecentTokens: 20_000,
  maxCompactionRetries: 1,
};

export interface ContextSummaryDecision {
  decision: string;
  reason?: string;
}

export interface ContextSummaryReference {
  label: string;
  value: string;
}

export interface ContextSummary {
  goal: string[];
  constraints: string[];
  completed: string[];
  inProgress: string[];
  blocked: string[];
  decisions: ContextSummaryDecision[];
  nextSteps: string[];
  criticalFacts: string[];
  references: ContextSummaryReference[];
}

export interface ContextCheckpoint {
  schemaVersion: number;
  checkpointId: string;
  contextKey: string;
  version: number;
  coveredTranscriptCursor: TranscriptCursor;
  summaryVersion: number;
  summary: ContextSummary;
  sourceTranscriptHash: string;
  externalContextRevision?: string;
  sourceRunId?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ContextCheckpointStore {
  load(contextKey: string): Promise<ContextCheckpoint | null>;
  save(input: { checkpoint: ContextCheckpoint; expectedVersion: number | null }): Promise<{
    accepted: boolean;
    current?: ContextCheckpoint;
  }>;
}

export interface ContextSummaryGenerator {
  generate(input: {
    previousSummary?: ContextSummary;
    messages: readonly unknown[];
    coveredTranscriptCursor: TranscriptCursor;
    signal?: AbortSignal;
  }): Promise<unknown>;
  estimateFixedContextTokens?(input: {
    previousSummary?: ContextSummary;
    coveredTranscriptCursor: TranscriptCursor;
  }): number;
}

export interface ContextCompactionEngineOptions {
  checkpointStore: ContextCheckpointStore;
  summaryGenerator: ContextSummaryGenerator;
  estimator?: TokenEstimator;
  policy?: Partial<ContextCompactionPolicy>;
  now?: () => Date;
  sourceTranscriptHash: (transcript: readonly ContextTranscriptEntry[]) => string;
  summaryFixedContextTokens?: number;
}

export type ContextCompactionFailureStage =
  | "boundary"
  | "summary"
  | "checkpoint"
  | "context_budget";

export class ContextCompactionError extends Error {
  constructor(
    message: string,
    readonly stage: ContextCompactionFailureStage,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ContextCompactionError";
  }
}
