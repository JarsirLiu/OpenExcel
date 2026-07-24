import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  sessionUpdate: vi.fn(),
  sessionUpdateMany: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  snapshotDeleteMany: vi.fn(),
  findSessionUndoCheckpoint: vi.fn(),
  setSessionUndoRun: vi.fn(),
  findRunsWithSnapshotsForSheets: vi.fn(),
  findRunsWithSnapshotsForSheetsInTransaction: vi.fn(),
  updateRun: vi.fn(),
  updateRunWithLease: vi.fn(),
  findRunUndoState: vi.fn(),
  deleteRunSnapshots: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
    session: {
      update: mocks.sessionUpdate,
      updateMany: mocks.sessionUpdateMany,
    },
    agentRun: {
      updateMany: mocks.agentRunUpdateMany,
    },
    agentRunSheetSnapshot: {
      deleteMany: mocks.snapshotDeleteMany,
    },
    agentRunChartSnapshot: {
      deleteMany: mocks.snapshotDeleteMany,
    },
  },
}));

vi.mock("../infrastructure/workspaceUndoLock.js", () => ({
  withWorkspaceUndoLock: (_workspaceId: number, operation: () => Promise<unknown>) => operation(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSessionUndoCheckpoint: mocks.findSessionUndoCheckpoint,
  setSessionUndoRun: mocks.setSessionUndoRun,
}));

vi.mock("./repository.js", () => ({
  updateRun: mocks.updateRun,
  updateRunWithLease: mocks.updateRunWithLease,
  findRunUndoState: mocks.findRunUndoState,
  findRunsWithSnapshotsForSheets: mocks.findRunsWithSnapshotsForSheets,
  findRunsWithSnapshotsForSheetsInTransaction: mocks.findRunsWithSnapshotsForSheetsInTransaction,
  deleteRunSnapshots: mocks.deleteRunSnapshots,
}));

import {
  completeRunAndUpdateUndoCheckpoint,
  invalidateUndoCheckpointsForSheets,
  withUndoTrackedSheetMutation,
  withUndoTrackedSheetMutationAfterSuccess,
} from "./undoCheckpoint.js";

function buildTx() {
  return {
    session: { updateMany: mocks.sessionUpdateMany },
    agentRun: { updateMany: mocks.agentRunUpdateMany },
    agentRunSheetSnapshot: { deleteMany: mocks.snapshotDeleteMany },
    agentRunChartSnapshot: { deleteMany: mocks.snapshotDeleteMany },
  } as any;
}

describe("undo checkpoint", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(buildTx()),
    );
    mocks.updateRun.mockResolvedValue({ id: 17 });
    mocks.updateRunWithLease.mockResolvedValue(true);
  });

  it("arms exactly the completed run when it has undo effects", async () => {
    mocks.findRunUndoState.mockResolvedValueOnce({
      id: 17,
      hasUndoEffects: true,
      undoInvalidated: false,
    });
    mocks.setSessionUndoRun.mockResolvedValueOnce(true);

    await completeRunAndUpdateUndoCheckpoint(3, 5, 17, { status: "completed" });

    expect(mocks.updateRun).toHaveBeenCalledWith(17, {
      status: "completed",
      endedAt: expect.any(Date),
    });
    expect(mocks.setSessionUndoRun).toHaveBeenCalledWith(5, 3, 17);
    expect(mocks.deleteRunSnapshots).not.toHaveBeenCalled();
  });

  it("discards snapshots when a run has no undo effects", async () => {
    mocks.findRunUndoState.mockResolvedValueOnce({
      id: 17,
      hasUndoEffects: false,
      undoInvalidated: false,
    });

    await completeRunAndUpdateUndoCheckpoint(3, 5, 17, { status: "completed" });

    expect(mocks.setSessionUndoRun).not.toHaveBeenCalled();
    expect(mocks.deleteRunSnapshots).toHaveBeenCalledWith(17);
  });

  it("arms a leased run only for the session version that created it", async () => {
    mocks.findRunUndoState.mockResolvedValueOnce({
      id: 17,
      hasUndoEffects: true,
      undoInvalidated: false,
    });
    mocks.setSessionUndoRun.mockResolvedValueOnce(true);

    await completeRunAndUpdateUndoCheckpoint(
      3,
      5,
      17,
      { status: "completed" },
      { ownerId: "owner-1", sessionVersion: 4 },
    );

    expect(mocks.setSessionUndoRun).toHaveBeenCalledWith(5, 3, 17, 4);
  });

  it("invalidates every active checkpoint candidate that snapshots the changed sheets", async () => {
    mocks.findRunsWithSnapshotsForSheetsInTransaction.mockResolvedValueOnce([19]);

    await invalidateUndoCheckpointsForSheets(3, [7]);

    expect(mocks.findRunsWithSnapshotsForSheetsInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      3,
      [7],
      undefined,
    );

    expect(mocks.agentRunUpdateMany).toHaveBeenCalledWith({
      where: { id: { in: [19] } },
      data: { undoInvalidated: true },
    });

    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith({
      where: { workspaceId: 3, undoRunId: { in: [19] } },
      data: { undoRunId: null },
    });
    expect(mocks.snapshotDeleteMany).toHaveBeenCalledWith({
      where: { runId: { in: [19] } },
    });
  });

  it("keeps unrelated checkpoints intact", async () => {
    mocks.findRunsWithSnapshotsForSheetsInTransaction.mockResolvedValueOnce([]);

    await invalidateUndoCheckpointsForSheets(3, [7]);

    expect(mocks.agentRunUpdateMany).not.toHaveBeenCalled();
  });

  it("excludes the mutating run while invalidating concurrent candidates", async () => {
    mocks.findRunsWithSnapshotsForSheetsInTransaction.mockResolvedValueOnce([]);

    await invalidateUndoCheckpointsForSheets(3, [7], 17);

    expect(mocks.findRunsWithSnapshotsForSheetsInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      3,
      [7],
      17,
    );
  });

  it("invalidates checkpoints before applying a sheet mutation", async () => {
    mocks.findRunsWithSnapshotsForSheetsInTransaction.mockResolvedValueOnce([19]);
    const mutation = vi.fn().mockResolvedValueOnce("written");

    await expect(withUndoTrackedSheetMutation(3, [7], mutation)).resolves.toBe("written");

    expect(mocks.transaction.mock.invocationCallOrder[0]).toBeLessThan(
      mutation.mock.invocationCallOrder[0],
    );
  });

  it("does not invalidate checkpoints when a revision-checked mutation fails", async () => {
    const mutation = vi.fn().mockRejectedValueOnce(new Error("conflict"));

    await expect(withUndoTrackedSheetMutationAfterSuccess(3, [7], mutation)).rejects.toThrow(
      "conflict",
    );

    expect(mocks.findRunsWithSnapshotsForSheetsInTransaction).not.toHaveBeenCalled();
  });

  it("invalidates the touched AI checkpoint after a successful external save", async () => {
    mocks.findRunsWithSnapshotsForSheetsInTransaction.mockResolvedValueOnce([19]);
    const mutation = vi.fn().mockResolvedValueOnce("saved");

    await expect(withUndoTrackedSheetMutationAfterSuccess(3, [7], mutation)).resolves.toBe("saved");

    expect(mocks.findRunsWithSnapshotsForSheetsInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      3,
      [7],
      undefined,
    );
    expect(mutation.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.findRunsWithSnapshotsForSheetsInTransaction.mock.invocationCallOrder[0],
    );
  });

  it("does not arm an invalidated run after it settles", async () => {
    mocks.findRunUndoState.mockResolvedValueOnce({
      id: 17,
      hasUndoEffects: true,
      undoInvalidated: true,
    });

    await completeRunAndUpdateUndoCheckpoint(3, 5, 17, { status: "completed" });

    expect(mocks.setSessionUndoRun).not.toHaveBeenCalled();
    expect(mocks.deleteRunSnapshots).toHaveBeenCalledWith(17);
  });
});
