import type { ContextCheckpoint, ContextCheckpointStore } from "@openexcel/agent";
import { withDatabaseWriteLock } from "../../../infra/database/databaseConcurrency.js";
import { prisma } from "../../../infra/database/db.js";

export interface RunCheckpoint {
  runId: number;
  checkpointSequence: number;
  transcript: unknown[];
  reasoning: string;
  toolState: unknown[];
  contextCheckpoint?: ContextCheckpoint;
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

function decodeContextCheckpoint(value: string | null): ContextCheckpoint | undefined {
  if (!value) return undefined;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" ? (parsed as ContextCheckpoint) : undefined;
  } catch {
    return undefined;
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
    ...(decodeContextCheckpoint(checkpoint.contextCheckpoint)
      ? { contextCheckpoint: decodeContextCheckpoint(checkpoint.contextCheckpoint) }
      : {}),
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
    ...(decodeContextCheckpoint(checkpoint.contextCheckpoint)
      ? { contextCheckpoint: decodeContextCheckpoint(checkpoint.contextCheckpoint) }
      : {}),
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
    select: { id: true, lastEventSequence: true, status: true },
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
  return withDatabaseWriteLock(() =>
    prisma.$transaction(async (tx) => {
      const existing = await tx.agentRunCheckpoint.findUnique({
        where: { runId: checkpoint.runId },
      });
      if (existing && existing.checkpointSequence > checkpoint.checkpointSequence) return false;

      if (!existing) {
        await tx.agentRunCheckpoint.create({
          data: {
            runId: checkpoint.runId,
            checkpointSequence: checkpoint.checkpointSequence,
            transcript: encode(checkpoint.transcript),
            reasoning: checkpoint.reasoning,
            toolState: encode(checkpoint.toolState),
            ...(checkpoint.contextCheckpoint
              ? {
                  contextCheckpoint: encode(checkpoint.contextCheckpoint),
                  contextVersion: checkpoint.contextCheckpoint.version,
                }
              : {}),
          },
        });
        return true;
      }

      if (existing.checkpointSequence === checkpoint.checkpointSequence) {
        await tx.agentRunCheckpoint.update({
          where: { runId: checkpoint.runId },
          data: {
            transcript: encode(checkpoint.transcript),
            reasoning: checkpoint.reasoning,
            toolState: encode(checkpoint.toolState),
            ...(checkpoint.contextCheckpoint
              ? {
                  contextCheckpoint: encode(checkpoint.contextCheckpoint),
                  contextVersion: checkpoint.contextCheckpoint.version,
                }
              : {}),
          },
        });
        return true;
      }

      const result = await tx.agentRunCheckpoint.updateMany({
        where: {
          runId: checkpoint.runId,
          checkpointSequence: { lt: checkpoint.checkpointSequence },
        },
        data: {
          checkpointSequence: checkpoint.checkpointSequence,
          transcript: encode(checkpoint.transcript),
          reasoning: checkpoint.reasoning,
          toolState: encode(checkpoint.toolState),
          ...(checkpoint.contextCheckpoint
            ? {
                contextCheckpoint: encode(checkpoint.contextCheckpoint),
                contextVersion: checkpoint.contextCheckpoint.version,
              }
            : {}),
        },
      });
      if (result.count !== 1) return false;
      return true;
    }),
  );
}

async function updateCheckpoint(checkpoint: RunCheckpoint) {
  return withDatabaseWriteLock(() =>
    prisma.$transaction(async (tx) => {
      const result = await tx.agentRunCheckpoint.updateMany({
        where: {
          runId: checkpoint.runId,
          checkpointSequence: { lt: checkpoint.checkpointSequence },
        },
        data: {
          checkpointSequence: checkpoint.checkpointSequence,
          transcript: encode(checkpoint.transcript),
          reasoning: checkpoint.reasoning,
          toolState: encode(checkpoint.toolState),
          ...(checkpoint.contextCheckpoint
            ? {
                contextCheckpoint: encode(checkpoint.contextCheckpoint),
                contextVersion: checkpoint.contextCheckpoint.version,
              }
            : {}),
        },
      });
      if (result.count !== 1) return false;

      return true;
    }),
  );
}

export function createRunContextCheckpointStore(
  runId: number,
  contextKey: string,
  workspaceId: number,
  sessionId: number,
): ContextCheckpointStore {
  return {
    async load(key) {
      if (key !== contextKey) throw new Error("Context checkpoint key mismatch");
      return (
        (await findRunCheckpoint(runId))?.contextCheckpoint ??
        (await findLatestSessionCheckpoint(workspaceId, sessionId))?.contextCheckpoint ??
        null
      );
    },
    async save({ checkpoint, expectedVersion }) {
      const currentRun = await findRunCheckpoint(runId);
      const current =
        currentRun?.contextCheckpoint ??
        (await findLatestSessionCheckpoint(workspaceId, sessionId))?.contextCheckpoint;
      const currentVersion = current?.version ?? null;
      if (currentVersion !== expectedVersion) {
        return { accepted: false, current };
      }

      if (!currentRun) {
        await withDatabaseWriteLock(() =>
          prisma.agentRunCheckpoint.create({
            data: {
              runId,
              checkpointSequence: -1,
              transcript: encode([]),
              reasoning: "",
              toolState: encode([]),
              contextCheckpoint: encode(checkpoint),
              contextVersion: checkpoint.version,
            },
          }),
        );
      } else {
        const result = await withDatabaseWriteLock(() =>
          prisma.agentRunCheckpoint.updateMany({
            where: {
              runId,
              contextVersion: currentRun.contextCheckpoint?.version ?? null,
            },
            data: {
              contextCheckpoint: encode(checkpoint),
              contextVersion: checkpoint.version,
            },
          }),
        );
        if (result.count !== 1) {
          return { accepted: false, current: (await findRunCheckpoint(runId))?.contextCheckpoint };
        }
      }

      return { accepted: true };
    },
  };
}

function isUniqueConstraintError(error: unknown): error is { code: "P2002" } {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
