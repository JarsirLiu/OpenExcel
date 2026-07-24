import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
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

export async function invalidateUndoCheckpointInTransaction(
  tx: Prisma.TransactionClient,
  sessionId: number,
  runId: number,
) {
  await Promise.all([
    tx.session.updateMany({
      where: { id: sessionId, undoRunId: runId },
      data: { undoRunId: null },
    }),
    tx.agentRun.update({
      where: { id: runId },
      data: { undoInvalidated: true },
    }),
    tx.agentRunSheetSnapshot.deleteMany({ where: { runId } }),
    tx.agentRunChartSnapshot.deleteMany({ where: { runId } }),
  ]);
}

export async function clearSessionUndoCheckpoint(workspaceId: number, sessionId: number) {
  return withWorkspaceUndoLock(workspaceId, () =>
    clearSessionUndoCheckpointInternal(workspaceId, sessionId),
  );
}

export async function invalidateUndoCheckpointsForSheetsInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  const uniqueSheetIds = [...new Set(sheetIds.filter(Number.isInteger))];
  if (uniqueSheetIds.length === 0) return;

  const affectedRunIds = await runRepo.findRunsWithSnapshotsForSheetsInTransaction(
    tx,
    workspaceId,
    uniqueSheetIds,
    originRunId,
  );
  if (affectedRunIds.length === 0) return;

  await Promise.all([
    tx.agentRun.updateMany({
      where: { id: { in: affectedRunIds } },
      data: { undoInvalidated: true },
    }),
    tx.session.updateMany({
      where: { workspaceId, undoRunId: { in: affectedRunIds } },
      data: { undoRunId: null },
    }),
    tx.agentRunSheetSnapshot.deleteMany({
      where: { runId: { in: affectedRunIds } },
    }),
    tx.agentRunChartSnapshot.deleteMany({
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
    prisma.$transaction((tx) =>
      invalidateUndoCheckpointsForSheetsInTransaction(tx, workspaceId, sheetIds, originRunId),
    ),
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
    await prisma.$transaction((tx) =>
      invalidateUndoCheckpointsForSheetsInTransaction(
        tx,
        workspaceId,
        resolvedSheetIds,
        originRunId,
      ),
    );
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
  mutation: (tx: Prisma.TransactionClient) => Promise<T>,
  originRunId?: number,
) {
  return withWorkspaceUndoLock(workspaceId, async () => {
    return prisma.$transaction(async (tx) => {
      const result = await mutation(tx);
      await invalidateUndoCheckpointsForSheetsInTransaction(tx, workspaceId, sheetIds, originRunId);
      return result;
    });
  });
}

export async function completeRunAndUpdateUndoCheckpoint(
  workspaceId: number,
  sessionId: number,
  runId: number,
  data: Record<string, unknown>,
  lease?: { ownerId: string; sessionVersion: number },
  recoveryGuard?: { sessionVersion: number },
) {
  return withWorkspaceUndoLock(workspaceId, async () => {
    const updated = recoveryGuard
      ? await runRepo.updateRunWithRecoveryGuard(runId, sessionId, recoveryGuard.sessionVersion, {
          ...data,
          endedAt: new Date(),
        })
      : lease
        ? await runRepo.updateRunWithLease(runId, { ...data, endedAt: new Date() }, lease)
        : await runRepo.updateRun(runId, { ...data, endedAt: new Date() });
    if (!updated) return false;

    const run = await runRepo.findRunUndoState(runId);
    if (!run) return true;

    if (run.hasUndoEffects && !run.undoInvalidated) {
      const sessionVersion = lease?.sessionVersion ?? recoveryGuard?.sessionVersion;
      const armed =
        sessionVersion == null
          ? await sessionRepo.setSessionUndoRun(sessionId, workspaceId, runId)
          : await sessionRepo.setSessionUndoRun(sessionId, workspaceId, runId, sessionVersion);
      if (armed) return true;
    }

    await runRepo.deleteRunSnapshots(runId);
    return true;
  });
}
