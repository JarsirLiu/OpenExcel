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
  const checkpoint = await prisma.agentRunCheckpoint.findFirst({
    where: {
      run: {
        sessionId,
        session: { workspaceId },
        status: { not: "reverted" },
      },
    },
    orderBy: [{ updatedAt: "desc" }, { runId: "desc" }],
  });
  if (!checkpoint) return null;
  return {
    runId: checkpoint.runId,
    checkpointSequence: checkpoint.checkpointSequence,
    transcript: decodeArray(checkpoint.transcript),
    reasoning: checkpoint.reasoning,
    toolState: decodeArray(checkpoint.toolState),
  } satisfies RunCheckpoint;
}

/** Writes a checkpoint only when it advances the durable projection boundary. */
export async function persistRunCheckpoint(checkpoint: RunCheckpoint) {
  try {
    return await writeCheckpoint(checkpoint);
  } catch (error) {
    // A concurrent first insert can win the unique runId constraint. Retry as
    // a guarded update outside the failed transaction (required by Postgres).
    if (!isUniqueConstraintError(error)) throw error;
    const result = await prisma.agentRunCheckpoint.updateMany({
      where: { runId: checkpoint.runId, checkpointSequence: { lt: checkpoint.checkpointSequence } },
      data: {
        checkpointSequence: checkpoint.checkpointSequence,
        transcript: encode(checkpoint.transcript),
        reasoning: checkpoint.reasoning,
        toolState: encode(checkpoint.toolState),
      },
    });
    return result.count === 1;
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
    return result.count === 1;
  });
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}

export async function advanceTranscriptSequence(runId: number, sequence: number) {
  const result = await prisma.agentRun.updateMany({
    where: {
      id: runId,
      transcriptSequence: { lt: sequence },
      lastEventSequence: { gte: sequence },
    },
    data: { transcriptSequence: sequence },
  });
  return result.count === 1;
}
