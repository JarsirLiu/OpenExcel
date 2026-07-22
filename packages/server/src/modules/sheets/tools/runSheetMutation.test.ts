import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  recordRestorableRunSheetSnapshot: vi.fn(),
  invalidateUndoCheckpointsForSheetsInTransaction: vi.fn(),
  sheetFindFirst: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: { $transaction: mocks.transaction },
}));

vi.mock("../../sessions/infrastructure/workspaceUndoLock.js", () => ({
  withWorkspaceUndoLock: (_workspaceId: number, operation: () => Promise<unknown>) => operation(),
}));

vi.mock("../../sessions/runs/repository.js", () => ({
  recordRestorableRunSheetSnapshot: mocks.recordRestorableRunSheetSnapshot,
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  invalidateUndoCheckpointsForSheetsInTransaction:
    mocks.invalidateUndoCheckpointsForSheetsInTransaction,
}));

import { SheetRevisionConflictError } from "../domain/errors.js";
import { runSheetMutation } from "./runSheetMutation.js";

const sheet = {
  id: 7,
  name: "Sheet1",
  sheetNo: 0,
  revision: 4,
  uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "A", m: "A" } }]),
  config: null,
  merges: JSON.stringify([{ row: [0, 0], col: [0, 1] }]),
  workbook: { workspaceId: 3 },
};

function buildTx() {
  return { sheet: { findFirst: mocks.sheetFindFirst } } as any;
}

describe("runSheetMutation", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(buildTx()),
    );
    mocks.sheetFindFirst.mockResolvedValue(sheet);
    mocks.recordRestorableRunSheetSnapshot.mockResolvedValue(undefined);
    mocks.invalidateUndoCheckpointsForSheetsInTransaction.mockResolvedValue(undefined);
  });

  it("rolls back the snapshot when the mutation conflicts", async () => {
    const mutation = vi.fn().mockRejectedValueOnce(new SheetRevisionConflictError(7));

    await expect(
      runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation),
    ).rejects.toBeInstanceOf(SheetRevisionConflictError);

    expect(mocks.recordRestorableRunSheetSnapshot).not.toHaveBeenCalled();
    expect(mocks.invalidateUndoCheckpointsForSheetsInTransaction).not.toHaveBeenCalled();
  });

  it("keeps the transaction atomic when a later mutation conflicts", async () => {
    const mutation = vi.fn().mockRejectedValueOnce(new SheetRevisionConflictError(7));

    await expect(
      runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation),
    ).rejects.toBeInstanceOf(SheetRevisionConflictError);

    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("stores legacy merges in the canonical undo snapshot", async () => {
    const mutation = vi.fn().mockResolvedValueOnce({ revision: 5, ok: true });

    await runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation);

    expect(mocks.recordRestorableRunSheetSnapshot).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        beforeRevision: 4,
        afterRevision: 5,
      }),
    );
    const snapshot = mocks.recordRestorableRunSheetSnapshot.mock.calls[0]?.[1];
    expect(JSON.parse(snapshot.uploadedData)).toEqual([
      {
        r: 0,
        c: 0,
        v: {
          v: "A",
          m: "A",
          fc: "#000000",
          mc: { r: 0, c: 0, rs: 1, cs: 2 },
        },
      },
      { r: 0, c: 1, v: { mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
    ]);
  });

  it("invalidates older checkpoints in the same transaction", async () => {
    const mutation = vi.fn().mockResolvedValueOnce({ revision: 5 });

    await runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation);

    expect(mocks.invalidateUndoCheckpointsForSheetsInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      3,
      [7],
      11,
    );
  });
});
