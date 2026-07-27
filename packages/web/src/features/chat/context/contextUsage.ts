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

export function contextUsageFromEvent(
  payload: unknown,
  occurredAt: string,
  current: ContextUsageSnapshot | null,
  runId: number | undefined,
): ContextUsageSnapshot | null {
  const value = asRecord(payload);
  const observation = asRecord(value?.tokenObservation);
  const usedTokens = readNonNegativeInteger(observation?.inputTokens);
  const estimatedContextTokens = readNonNegativeInteger(value?.estimatedContextTokens);
  const source = observation?.source;
  if (
    usedTokens == null ||
    estimatedContextTokens == null ||
    (source !== "provider" && source !== "estimate" && source !== "mixed")
  ) {
    return null;
  }

  const contextWindowTokens =
    readPositiveInteger(value?.contextWindowTokens) ?? current?.contextWindowTokens;
  if (contextWindowTokens == null) return null;

  return {
    contextWindowTokens,
    usedTokens,
    estimatedContextTokens,
    percentage: (usedTokens / contextWindowTokens) * 100,
    source,
    runId: runId ?? current?.runId ?? null,
    updatedAt: occurredAt,
  };
}

export function isNewerContextUsage(
  candidate: ContextUsageSnapshot,
  current: ContextUsageSnapshot | null,
): boolean {
  if (!current?.updatedAt) return true;
  if (!candidate.updatedAt) return false;
  return candidate.updatedAt >= current.updatedAt;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.ceil(value)
    : null;
}

function readPositiveInteger(value: unknown): number | null {
  const result = readNonNegativeInteger(value);
  return result != null && result > 0 ? result : null;
}
