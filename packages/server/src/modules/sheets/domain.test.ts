import { describe, expect, it } from "vitest";
import {
  applyClearOperation,
  applyMergeOperation,
  buildSheetChangePreview,
  normalizeWriteOperations,
  parseMergesFromCelldata,
  toA1CellRef,
  toA1Range,
} from "./domain.js";

describe("sheet domain helpers", () => {
  it("formats A1 references", () => {
    expect(toA1CellRef(1, 1)).toBe("A1");
    expect(toA1CellRef(2, 27)).toBe("AA2");
    expect(toA1Range(1, 1, 2, 3)).toBe("A1:C2");
  });

  it("normalizes write operations without changing semantics", () => {
    const result = normalizeWriteOperations({
      sheetId: 3,
      operations: [
        { type: "cell", row: 1, col: 2, value: "x" },
        { type: "range", startRow: 3, startCol: 4, endRow: 5, endCol: 6, value: "y" },
      ],
    });

    expect(result).toEqual({
      sheetId: 3,
      operations: [
        { type: "cell", row: 1, col: 2, value: "x" },
        { type: "range", startRow: 3, startCol: 4, endRow: 5, endCol: 6, value: "y" },
      ],
    });
  });

  it("parses merged ranges from celldata", () => {
    const merges = parseMergesFromCelldata([
      { r: 0, c: 0, v: { mc: { rs: 2, cs: 3 } } },
      { r: 4, c: 2, v: {} },
    ]);

    expect(merges).toEqual([
      { startRow: 1, startCol: 1, endRow: 2, endCol: 3 },
    ]);
  });

  it("builds previews from a celldata slice", () => {
    const preview = buildSheetChangePreview(
      [
        { r: 0, c: 0, v: { v: "A" } },
        { r: 1, c: 1, v: { v: "B", mc: { rs: 2, cs: 2 } } },
        { r: 2, c: 2, v: { v: "C" } },
      ] as any,
      "Sheet1",
      7,
      0,
      1,
    );

    expect(preview.sheetId).toBe(7);
    expect(preview.sheetName).toBe("Sheet1");
    expect(preview.rows).toEqual([
      ["A", "", ""],
      ["", "B", ""],
    ]);
    expect(preview.merges).toEqual([
      { startRow: 2, startCol: 2, endRow: 3, endCol: 3 },
    ]);
  });

  it("applies merge and clear operations to a cell map", () => {
    const cellMap = new Map<string, any>([
      ["0,0", { r: 0, c: 0, v: { v: "keep" } }],
      ["1,1", { r: 1, c: 1, v: { v: "merge", mc: { r: 1, c: 1, rs: 1, cs: 1 } } }],
      ["3,3", { r: 3, c: 3, v: { v: "remove" } }],
    ]);

    applyMergeOperation(cellMap, { startRow: 1, startCol: 1, endRow: 2, endCol: 2 });
    expect(cellMap.get("1,1").v.mc).toEqual({ r: 1, c: 1, rs: 2, cs: 2 });

    const touched = applyClearOperation(cellMap, { type: "cell", row: 4, col: 4 } as any);
    expect(touched).toEqual(["3,3"]);
    expect(cellMap.has("3,3")).toBe(false);
  });
});
