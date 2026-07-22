import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findSheet: vi.fn(),
  findReceipt: vi.fn(),
  commitSheetCommand: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: { $transaction: mocks.transaction },
}));
vi.mock("../infrastructure/sheetMutationReceiptRepository.js", () => ({
  commitSheetCommandInTransaction: mocks.commitSheetCommand,
}));

import { executeSheetCommand } from "./executeSheetCommand.js";
import { sheetCommandFingerprint } from "./sheetCommandFingerprint.js";

const command = {
  kind: "mutation" as const,
  mutationId: "mutation-1",
  sheetId: 7,
  baseRevision: 2,
  mutation: { type: "write" as const, cells: [{ row: 1, col: 1, value: "next" }] },
};

describe("executeSheetCommand", () => {
  beforeEach(() => {
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.findSheet.mockResolvedValue({
      id: 7,
      sheetNo: 1,
      name: "Sheet1",
      revision: 2,
      uploadedData: "[]",
      config: null,
      workbook: { workspaceId: 3 },
    });
    mocks.findReceipt.mockResolvedValue(null);
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback({
        sheet: { findFirst: mocks.findSheet },
        sheetMutationReceipt: { findUnique: mocks.findReceipt },
      }),
    );
    mocks.commitSheetCommand.mockResolvedValue({ kind: "committed", revision: 3 });
  });

  it("applies a mutation and commits one conditional snapshot update", async () => {
    const result = await executeSheetCommand(3, command);

    expect(result.revision).toBe(3);
    expect(result.snapshot.celldata).toEqual([{ r: 0, c: 0, v: { v: "next", m: "next" } }]);
    expect(mocks.commitSheetCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        sheetId: 7,
        workspaceId: 3,
        baseRevision: 2,
        mutationId: "mutation-1",
        merges: "[]",
        uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "next", m: "next" } }]),
      }),
    );
  });

  it("canonicalizes a legacy merge before unmerging and clears stale metadata", async () => {
    mocks.findSheet.mockResolvedValueOnce({
      id: 7,
      sheetNo: 1,
      name: "Sheet1",
      revision: 2,
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "A", m: "A" } }]),
      config: null,
      merges: JSON.stringify([{ row: [0, 0], col: [0, 1] }]),
      workbook: { workspaceId: 3 },
    });
    const result = await executeSheetCommand(3, {
      kind: "mutation",
      mutationId: "unmerge-legacy-1",
      sheetId: 7,
      baseRevision: 2,
      mutation: {
        type: "unmerge",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2 }],
      },
    });

    expect(result.snapshot.celldata).toEqual([
      { r: 0, c: 0, v: { v: "A", m: "A", fc: "#000000" } },
    ]);
    expect(mocks.commitSheetCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ merges: "[]" }),
    );
  });

  it("replays a receipt without writing the Sheet again", async () => {
    mocks.findSheet.mockResolvedValueOnce({
      id: 7,
      sheetNo: 1,
      name: "Sheet1",
      revision: 3,
      uploadedData: "[]",
      config: null,
      workbook: { workspaceId: 3 },
    });
    const stored = JSON.stringify({
      mutationId: "mutation-1",
      sheetId: 7,
      baseRevision: 2,
      revision: 3,
      mutation: command.mutation,
      changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
    });
    mocks.findReceipt.mockResolvedValue({
      commandHash: sheetCommandFingerprint(command),
      result: stored,
    });

    const result = await executeSheetCommand(3, command);

    expect(result.revision).toBe(3);
    expect(result.mutation).toEqual(command.mutation);
    expect(mocks.commitSheetCommand).not.toHaveBeenCalled();
  });

  it("replays after the Sheet revision has advanced", async () => {
    mocks.findReceipt.mockResolvedValueOnce(null).mockResolvedValueOnce({
      commandHash: sheetCommandFingerprint(command),
      result: JSON.stringify({
        mutationId: "mutation-1",
        sheetId: 7,
        baseRevision: 2,
        revision: 3,
        mutation: command.mutation,
        changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
      }),
    });
    mocks.findSheet
      .mockResolvedValueOnce({
        id: 7,
        sheetNo: 1,
        name: "Sheet1",
        revision: 2,
        uploadedData: "[]",
        config: null,
        workbook: { workspaceId: 3 },
      })
      .mockResolvedValueOnce({
        id: 7,
        sheetNo: 1,
        name: "Sheet1",
        revision: 4,
        uploadedData: "[]",
        config: null,
        workbook: { workspaceId: 3 },
      });

    const firstResult = await executeSheetCommand(3, command);
    const result = await executeSheetCommand(3, { ...command, baseRevision: 3 });

    expect(firstResult.revision).toBe(3);
    expect(result.revision).toBe(4);
    expect(result.baseRevision).toBe(2);
    expect(mocks.commitSheetCommand).toHaveBeenCalledTimes(1);
  });

  it("rejects reusing a mutation id for a different command", async () => {
    mocks.findReceipt.mockResolvedValue({
      commandHash: sheetCommandFingerprint(command),
      result: JSON.stringify({
        mutationId: command.mutationId,
        sheetId: command.sheetId,
        baseRevision: command.baseRevision,
        revision: 3,
        mutation: command.mutation,
        changeSummary: { changedCellCount: 1, rangeOperationCount: 0 },
      }),
    });

    await expect(
      executeSheetCommand(3, {
        ...command,
        mutation: { type: "write", cells: [{ row: 1, col: 1, value: "different" }] },
      }),
    ).rejects.toThrow("已用于其他命令");
    expect(mocks.commitSheetCommand).not.toHaveBeenCalled();
  });

  it("rejects a concurrent replay when the stored command hash differs", async () => {
    mocks.commitSheetCommand.mockResolvedValueOnce({
      kind: "replayed",
      commandHash: "different-command-hash",
      result: "{}",
    });

    await expect(executeSheetCommand(3, command)).rejects.toThrow("已用于其他命令");
  });
});
