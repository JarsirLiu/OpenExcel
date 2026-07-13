import { beforeEach, describe, expect, it, vi } from "vitest";
import * as service from "./service.js";
import {
  applyToolOperations,
  clearOperationToDocument,
  rangeForWriteOperation,
  writeOperationToDocument,
} from "./toolAdapter.js";

vi.mock("./service.js", () => ({
  applyOperations: vi.fn(),
  getSheetInfo: vi.fn(),
  readRange: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(service.getSheetInfo).mockReset();
  vi.mocked(service.applyOperations).mockReset();
});

describe("document tool adapter", () => {
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

  it("converts one-based cell writes to canonical coordinates", () => {
    expect(
      writeOperationToDocument({
        type: "cell",
        row: 3,
        col: 2,
        value: 42,
        formula: "=A1+1",
      }),
    ).toEqual({
      type: "setCell",
      row: 2,
      col: 1,
      value: { value: 42, displayValue: "42", formula: "A1+1" },
    });
  });

  it("creates a dense canonical range operation for range fills", () => {
    expect(
      writeOperationToDocument({
        type: "range",
        startRow: 2,
        startCol: 2,
        endRow: 3,
        endCol: 3,
        value: "ok",
      }),
    ).toEqual({
      type: "setRangeValues",
      range: { startRow: 1, startCol: 1, endRow: 2, endCol: 2 },
      values: [
        ["ok", "ok"],
        ["ok", "ok"],
      ],
    });
  });

  it("converts clear operations without touching renderer data", () => {
    expect(clearOperationToDocument({ type: "cell", row: 4, col: 5 })).toEqual({
      type: "clearRange",
      range: { startRow: 3, startCol: 4, endRow: 3, endCol: 4 },
    });
    expect(
      rangeForWriteOperation({
        type: "range",
        startRow: 2,
        startCol: 3,
        endRow: 4,
        endCol: 5,
        value: true,
      }),
    ).toEqual({ startRow: 1, startCol: 2, endRow: 3, endCol: 4 });
  });
});
