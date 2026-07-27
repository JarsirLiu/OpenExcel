import { loadModelConfig } from "../../../config.js";
import { findLatestSessionContextUsage } from "../runs/contextUsageRepository.js";

export type ContextUsageSource = "provider" | "estimate" | "mixed" | "none";

export interface ContextUsageSnapshot {
  contextWindowTokens: number;
  usedTokens: number;
  estimatedContextTokens: number | null;
  percentage: number;
  source: ContextUsageSource;
  runId: number | null;
  updatedAt: string | null;
}

export async function getContextUsage(
  workspaceId: number,
  sessionId: number,
): Promise<ContextUsageSnapshot> {
  const contextWindowTokens = loadModelConfig().contextWindowTokens;
  const usage = await findLatestSessionContextUsage(workspaceId, sessionId);
  if (!usage) {
    return emptySnapshot(contextWindowTokens);
  }

  return {
    contextWindowTokens,
    usedTokens: usage.inputTokens,
    estimatedContextTokens: usage.estimatedContextTokens,
    percentage: roundPercentage(usage.inputTokens, contextWindowTokens),
    source: usage.source,
    runId: usage.runId,
    updatedAt: usage.occurredAt.toISOString(),
  };
}

function roundPercentage(usedTokens: number, contextWindowTokens: number) {
  return Math.round((usedTokens / contextWindowTokens) * 100 * 100) / 100;
}

function emptySnapshot(contextWindowTokens: number): ContextUsageSnapshot {
  return {
    contextWindowTokens,
    usedTokens: 0,
    estimatedContextTokens: null,
    percentage: 0,
    source: "none",
    runId: null,
    updatedAt: null,
  };
}
