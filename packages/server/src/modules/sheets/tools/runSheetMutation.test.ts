import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSheetForWorkspace: vi.fn(),
  findRunSheetSnapshot: vi.fn(),
  upsertRunSheetSnapshot: vi.fn(),
  deleteRunSheetSnapshot: vi.fn(),
}));

vi.mock("../../sessions/runs/repository.js", () => ({
  findRunSheetSnapshot: mocks.findRunSheetSnapshot,
  upsertRunSheetSnapshot: mocks.upsertRunSheetSnapshot,
  deleteRunSheetSnapshot: mocks.deleteRunSheetSnapshot,
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  withUndoTrackedSheetMutationAfterSuccess: (
    _workspaceId: number,
    _sheetIds: number[],
    mutation: () => Promise<unknown>,
  ) => mutation(),
}));

vi.mock("../infrastructure/sheetRepository.js", () => ({
  findSheetForWorkspace: mocks.findSheetForWorkspace,
}));

import { SheetRevisionConflictError } from "../domain/errors.js";
import { runSheetMutation } from "./runSheetMutation.js";

const sheet = {
  id: 7,
  name: "Sheet1",
  sheetNo: 0,
  revision: 4,
  uploadedData: "[]",
  config: null,
  workbook: { workspaceId: 3 },
};

describe("runSheetMutation", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.findSheetForWorkspace.mockResolvedValue(sheet);
    mocks.findRunSheetSnapshot.mockResolvedValue(null);
    mocks.upsertRunSheetSnapshot.mockResolvedValue(undefined);
  });

  it("removes the temporary snapshot when the mutation conflicts", async () => {
    const mutation = vi.fn().mockRejectedValueOnce(new SheetRevisionConflictError(7));

    await expect(
      runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation),
    ).rejects.toBeInstanceOf(SheetRevisionConflictError);

    expect(mocks.deleteRunSheetSnapshot).toHaveBeenCalledWith(11, 7);
  });

  it("keeps an existing snapshot when a later mutation conflicts", async () => {
    mocks.findRunSheetSnapshot.mockResolvedValueOnce({ runId: 11, sheetId: 7 });
    const mutation = vi.fn().mockRejectedValueOnce(new SheetRevisionConflictError(7));

    await expect(
      runSheetMutation({ runId: 11, workspaceId: 3 }, 7, mutation),
    ).rejects.toBeInstanceOf(SheetRevisionConflictError);

    expect(mocks.deleteRunSheetSnapshot).not.toHaveBeenCalled();
  });
});
