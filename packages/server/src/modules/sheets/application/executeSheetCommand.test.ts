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
  mutation: {
    type: "write" as const,
    operations: [
      { type: "range" as const, startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "next" },
    ],
  },
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

    expect(result.outcome).toBe("committed");
    expect(result.result.revision).toBe(3);
    expect(result.result.snapshot?.celldata).toEqual([{ r: 0, c: 0, v: { v: "next", m: "next" } }]);
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
    const commitInput = mocks.commitSheetCommand.mock.calls[0]?.[1];
    expect(JSON.parse(commitInput.result)).not.toHaveProperty("snapshot");
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

    expect(result.outcome).toBe("committed");
    expect(result.result.snapshot?.celldata).toEqual([
      { r: 0, c: 0, v: { v: "A", m: "A", fc: "#000000" } },
    ]);
    expect(mocks.commitSheetCommand).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ merges: "[]" }),
    );
  });

  it("reports actual cell differences for a snapshot replacement", async () => {
    mocks.findSheet.mockResolvedValueOnce({
      id: 7,
      sheetNo: 1,
      name: "Sheet1",
      revision: 2,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "old", m: "old" } },
        { r: 1, c: 1, v: { v: "same", m: "same" } },
      ]),
      config: null,
      workbook: { workspaceId: 3 },
    });

    const result = await executeSheetCommand(3, {
      kind: "replaceSnapshot",
      mutationId: "replace-1",
      sheetId: 7,
      baseRevision: 2,
      snapshot: {
        celldata: [
          { r: 0, c: 0, v: { v: "new", m: "new" } },
          { r: 1, c: 1, v: { v: "same", m: "same" } },
          { r: 2, c: 2, v: { v: "added", m: "added" } },
        ],
        config: null,
      },
    });

    expect(result.result.changeSummary).toEqual({
      changedCellCount: 2,
      changedRanges: ["A1", "C3"],
      omittedRangeCount: 0,
      truncated: false,
      operationCount: 0,
    });
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
      changeSummary: {
        changedCellCount: 1,
        changedRanges: ["A1"],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
    });
    mocks.findReceipt.mockResolvedValue({
      commandHash: sheetCommandFingerprint(command),
      result: stored,
    });

    const result = await executeSheetCommand(3, command);

    expect(result.outcome).toBe("replayed");
    expect(result.result.revision).toBe(3);
    expect(result.result.mutation).toEqual(command.mutation);
    expect(result.result.snapshot).toBeNull();
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
        changeSummary: {
          changedCellCount: 1,
          changedRanges: ["A1"],
          omittedRangeCount: 0,
          truncated: false,
          operationCount: 1,
        },
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

    expect(firstResult.outcome).toBe("committed");
    expect(result.outcome).toBe("replayed");
    expect(firstResult.result.revision).toBe(3);
    expect(result.result.revision).toBe(3);
    expect(result.result.baseRevision).toBe(2);
    expect(result.result.snapshot).toBeNull();
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
        changeSummary: {
          changedCellCount: 1,
          changedRanges: ["A1"],
          omittedRangeCount: 0,
          truncated: false,
          operationCount: 1,
        },
      }),
    });

    await expect(
      executeSheetCommand(3, {
        ...command,
        mutation: {
          type: "write",
          operations: [
            { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "different" },
          ],
        },
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
