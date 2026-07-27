import { prisma } from "../../../infra/database/db.js";

export interface PersistedContextUsage {
  runId: number;
  occurredAt: Date;
  inputTokens: number;
  estimatedContextTokens: number;
  source: "provider" | "estimate" | "mixed";
}

export async function findLatestSessionContextUsage(
  workspaceId: number,
  sessionId: number,
): Promise<PersistedContextUsage | null> {
  const event = await prisma.agentEvent.findFirst({
    where: {
      type: "step.finished",
      run: {
        sessionId,
        status: { not: "reverted" },
        session: { workspaceId },
      },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: {
      runId: true,
      occurredAt: true,
      payload: true,
    },
  });

  if (!event) return null;
  return parseContextUsage(event.runId, event.occurredAt, event.payload);
}

function parseContextUsage(
  runId: number,
  occurredAt: Date,
  payload: string,
): PersistedContextUsage | null {
  let value: unknown;
  try {
    value = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isRecord(value) || !isRecord(value.tokenObservation)) return null;
  const inputTokens = readNonNegativeInteger(value.tokenObservation.inputTokens);
  const estimatedContextTokens = readNonNegativeInteger(value.estimatedContextTokens);
  const source = value.tokenObservation.source;
  if (
    inputTokens == null ||
    estimatedContextTokens == null ||
    (source !== "provider" && source !== "estimate" && source !== "mixed")
  ) {
    return null;
  }

  return { runId, occurredAt, inputTokens, estimatedContextTokens, source };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readNonNegativeInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.ceil(value)
    : null;
}
