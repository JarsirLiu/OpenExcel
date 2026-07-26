import { prisma } from "../../../infra/database/db.js";

export interface RunCheckpoint {
  runId: number;
  checkpointSequence: number;
  transcript: unknown[];
  reasoning: string;
  toolState: unknown[];
}

function encode(value: unknown) {
  return JSON.stringify(value);
}

function decodeArray(value: string): unknown[] {
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function findRunCheckpoint(runId: number) {
  const checkpoint = await prisma.agentRunCheckpoint.findUnique({ where: { runId } });
  if (!checkpoint) return null;
  return {
    runId: checkpoint.runId,
    checkpointSequence: checkpoint.checkpointSequence,
    transcript: decodeArray(checkpoint.transcript),
    reasoning: checkpoint.reasoning,
    toolState: decodeArray(checkpoint.toolState),
  } satisfies RunCheckpoint;
}

export async function findLatestSessionCheckpoint(workspaceId: number, sessionId: number) {
  const run = await prisma.agentRun.findFirst({
    where: {
      sessionId,
      session: { workspaceId },
      status: { not: "reverted" },
      checkpoint: { isNot: null },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: { checkpoint: true },
  });
  const checkpoint = run?.checkpoint;
  if (!checkpoint) return null;
  return {
    runId: checkpoint.runId,
    checkpointSequence: checkpoint.checkpointSequence,
    transcript: decodeArray(checkpoint.transcript),
    reasoning: checkpoint.reasoning,
    toolState: decodeArray(checkpoint.toolState),
  } satisfies RunCheckpoint;
}

export async function findLatestSessionRun(workspaceId: number, sessionId: number) {
  return prisma.agentRun.findFirst({
    where: {
      sessionId,
      session: { workspaceId },
      status: { not: "reverted" },
    },
    select: { id: true, lastEventSequence: true },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function findRunProjectionState(
  workspaceId: number,
  sessionId: number,
  runId: number,
) {
  return prisma.agentRun.findFirst({
    where: { id: runId, sessionId, session: { workspaceId }, status: { not: "reverted" } },
    select: { id: true, lastEventSequence: true },
  });
}

/** Writes the checkpoint with a monotonic per-run projection boundary. */
export async function persistRunCheckpoint(checkpoint: RunCheckpoint) {
  try {
    return await writeCheckpoint(checkpoint);
  } catch (error) {
    // A concurrent first insert can win the unique runId constraint. Retry as
    // a guarded update outside the failed transaction (required by Postgres).
    if (!isUniqueConstraintError(error)) throw error;
    return updateCheckpoint(checkpoint);
  }
}

async function writeCheckpoint(checkpoint: RunCheckpoint) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentRunCheckpoint.findUnique({ where: { runId: checkpoint.runId } });
    if (existing && existing.checkpointSequence >= checkpoint.checkpointSequence) return false;

    if (!existing) {
      await tx.agentRunCheckpoint.create({
        data: {
          runId: checkpoint.runId,
          checkpointSequence: checkpoint.checkpointSequence,
          transcript: encode(checkpoint.transcript),
          reasoning: checkpoint.reasoning,
          toolState: encode(checkpoint.toolState),
        },
      });
      return true;
    }

    const result = await tx.agentRunCheckpoint.updateMany({
      where: { runId: checkpoint.runId, checkpointSequence: { lt: checkpoint.checkpointSequence } },
      data: {
        checkpointSequence: checkpoint.checkpointSequence,
        transcript: encode(checkpoint.transcript),
        reasoning: checkpoint.reasoning,
        toolState: encode(checkpoint.toolState),
      },
    });
    if (result.count !== 1) return false;
    return true;
  });
}

async function updateCheckpoint(checkpoint: RunCheckpoint) {
  return prisma.$transaction(async (tx) => {
    const result = await tx.agentRunCheckpoint.updateMany({
      where: { runId: checkpoint.runId, checkpointSequence: { lt: checkpoint.checkpointSequence } },
      data: {
        checkpointSequence: checkpoint.checkpointSequence,
        transcript: encode(checkpoint.transcript),
        reasoning: checkpoint.reasoning,
        toolState: encode(checkpoint.toolState),
      },
    });
    if (result.count !== 1) return false;

    return true;
  });
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
