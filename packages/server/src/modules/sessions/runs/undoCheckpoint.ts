import { prisma } from "../../../infra/database/db.js";
import * as sessionRepo from "../infrastructure/sessionRepository.js";
import { withWorkspaceUndoLock } from "../infrastructure/workspaceUndoLock.js";
import * as runRepo from "./repository.js";

async function clearSessionUndoCheckpointInternal(workspaceId: number, sessionId: number) {
  const session = await sessionRepo.findSessionUndoCheckpoint(sessionId, workspaceId);
  if (!session?.undoRunId) return;

  await prisma.$transaction([
    prisma.session.update({
      where: { id: session.id },
      data: { undoRunId: null },
    }),
    prisma.agentRunSheetSnapshot.deleteMany({
      where: { runId: session.undoRunId },
    }),
    prisma.agentRunChartSnapshot.deleteMany({
      where: { runId: session.undoRunId },
    }),
  ]);
}

export async function clearSessionUndoCheckpoint(workspaceId: number, sessionId: number) {
  return withWorkspaceUndoLock(workspaceId, () =>
    clearSessionUndoCheckpointInternal(workspaceId, sessionId),
  );
}

async function invalidateUndoCheckpointsForSheetsInternal(
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  const uniqueSheetIds = [...new Set(sheetIds.filter(Number.isInteger))];
  if (uniqueSheetIds.length === 0) return;

  const affectedRunIds = await runRepo.findRunsWithSnapshotsForSheets(
    workspaceId,
    uniqueSheetIds,
    originRunId,
  );
  if (affectedRunIds.length === 0) return;

  await prisma.$transaction([
    prisma.agentRun.updateMany({
      where: { id: { in: affectedRunIds } },
      data: { undoInvalidated: true },
    }),
    prisma.session.updateMany({
      where: { workspaceId, undoRunId: { in: affectedRunIds } },
      data: { undoRunId: null },
    }),
    prisma.agentRunSheetSnapshot.deleteMany({
      where: { runId: { in: affectedRunIds } },
    }),
    prisma.agentRunChartSnapshot.deleteMany({
      where: { runId: { in: affectedRunIds } },
    }),
  ]);
}

export async function invalidateUndoCheckpointsForSheets(
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  return withWorkspaceUndoLock(workspaceId, () =>
    invalidateUndoCheckpointsForSheetsInternal(workspaceId, sheetIds, originRunId),
  );
}

export async function withUndoTrackedMutation<T>(
  workspaceId: number,
  sheetIds: number[] | (() => number[] | Promise<number[]>),
  mutation: () => Promise<T>,
  originRunId?: number,
) {
  return withWorkspaceUndoLock(workspaceId, async () => {
    const resolvedSheetIds = typeof sheetIds === "function" ? await sheetIds() : sheetIds;
    await invalidateUndoCheckpointsForSheetsInternal(workspaceId, resolvedSheetIds, originRunId);
    return mutation();
  });
}

export async function withUndoTrackedSheetMutation<T>(
  workspaceId: number,
  sheetIds: number[],
  mutation: () => Promise<T>,
  originRunId?: number,
) {
  return withUndoTrackedMutation(workspaceId, sheetIds, mutation, originRunId);
}

export async function withUndoTrackedSheetMutationAfterSuccess<T>(
  workspaceId: number,
  sheetIds: number[],
  mutation: () => Promise<T>,
  originRunId?: number,
) {
  return withWorkspaceUndoLock(workspaceId, async () => {
    const result = await mutation();
    await invalidateUndoCheckpointsForSheetsInternal(workspaceId, sheetIds, originRunId);
    return result;
  });
}

export async function completeRunAndUpdateUndoCheckpoint(
  workspaceId: number,
  sessionId: number,
  runId: number,
  data: Record<string, unknown>,
) {
  return withWorkspaceUndoLock(workspaceId, async () => {
    await runRepo.updateRun(runId, {
      ...data,
      endedAt: new Date(),
    });

    const run = await runRepo.findRunUndoState(runId);
    if (!run) return;

    if (run.hasUndoEffects && !run.undoInvalidated) {
      const armed = await sessionRepo.setSessionUndoRun(sessionId, workspaceId, runId);
      if (armed) return;
    }

    await runRepo.deleteRunSnapshots(runId);
  });
}
