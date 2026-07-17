import { describe, expect, it } from "vitest";
import {
  sheetChangeDeltaToZeroBased,
  storageIndex,
  zeroBasedSheetChangeDeltaToSheetChangeDelta,
} from "./sheetCoordinates.js";

describe("sheet coordinate conversions", () => {
  it("converts a one-based delta to zero-based for storage", () => {
    const delta = sheetChangeDeltaToZeroBased({
      type: "write",
      cells: [{ row: 1, col: 2, value: "A", formula: "SUM(A1:A3)" }],
      merges: [{ startRow: 3, startCol: 4, endRow: 5, endCol: 6 }],
    });

    expect(delta).toEqual({
      type: "write",
      cells: [{ row: 0, col: 1, value: "A", formula: "SUM(A1:A3)" }],
      merges: [{ startRow: 2, startCol: 3, endRow: 4, endCol: 5 }],
    });
  });

  it("converts a zero-based delta back to one-based", () => {
    const delta = zeroBasedSheetChangeDeltaToSheetChangeDelta({
      type: "merge",
      operations: [
        {
          startRow: storageIndex(0),
          startCol: storageIndex(1),
          endRow: storageIndex(2),
          endCol: storageIndex(3),
        },
      ],
    });

    expect(delta).toEqual({
      type: "merge",
      operations: [{ type: "range", startRow: 1, startCol: 2, endRow: 3, endCol: 4 }],
    });
  });

  it("converts a clear delta round-trip", () => {
    const delta = sheetChangeDeltaToZeroBased({
      type: "clear",
      operations: [
        { type: "cell", row: 2, col: 3 },
        { type: "range", startRow: 4, startCol: 5, endRow: 6, endCol: 7 },
      ],
    });

    expect(delta).toEqual({
      type: "clear",
      operations: [
        { type: "cell", row: 1, col: 2 },
        { type: "range", startRow: 3, startCol: 4, endRow: 5, endCol: 6 },
      ],
    });
  });

  it("rejects invalid coordinate and merge inputs at the boundary", () => {
    expect(() => storageIndex(-1)).toThrow("non-negative");
  });
});
