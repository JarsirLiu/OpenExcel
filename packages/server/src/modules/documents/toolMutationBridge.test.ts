import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "./service.js";
import { applyToolOperations } from "./toolMutationBridge.js";

vi.mock("./service.js", () => ({
  applyOperations: vi.fn(),
  getSheetInfo: vi.fn(),
  readRange: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(service.getSheetInfo).mockReset();
  vi.mocked(service.applyOperations).mockReset();
});

describe("tool mutation bridge", () => {
  it("maps canonical mutation metadata for tool consumers", async () => {
    vi.mocked(service.getSheetInfo).mockResolvedValue({
      sheetId: 7,
      sheetNo: 1,
      name: "Data",
      format: "openexcel-document-v1",
      version: 1,
      revision: 3,
      maxRow: 10,
      maxColumn: 5,
    });
    vi.mocked(service.applyOperations).mockResolvedValue({
      batchId: "batch-1",
      revision: 4,
      changedRanges: [{ startRow: 1, startCol: 2, endRow: 1, endCol: 2 }],
      objectIds: ["merge:1:2:1:2"],
      calculatedCells: [],
    });

    const result = await applyToolOperations(9, 7, [
      { type: "setCell", row: 1, col: 2, value: { value: "x" } },
    ]);

    expect(result.mutation).toEqual({
      sheetId: 7,
      revision: 4,
      changedRanges: [{ startRow: 1, startCol: 2, endRow: 1, endCol: 2 }],
      objectIds: ["merge:1:2:1:2"],
    });
  });
});
