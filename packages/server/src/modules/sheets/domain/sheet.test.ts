import { storageIndex, type ToolIndex } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import {
  applyCellWrite,
  applyClearOperation,
  applyMergeOperation,
  cellContentEqual,
  normalizeWriteOperations,
  snapshotCellContent,
} from "./sheet.js";
import { buildSheetChangePreview } from "./sheetPreview.js";

describe("sheet domain helpers", () => {
  it("normalizes write operations without changing semantics", () => {
    const result = normalizeWriteOperations({
      sheetId: 3,
      operations: [
        { type: "cell", row: 1, col: 2, value: "x", formula: "A1+B1" },
        {
          type: "range",
          startRow: 3,
          startCol: 4,
          endRow: 5,
          endCol: 6,
          value: "y",
          formula: "SUM(A1:A3)",
        },
      ],
    });

    expect(result).toEqual({
      sheetId: 3,
      operations: [
        { type: "cell", row: 1, col: 2, value: "x", formula: "A1+B1" },
        {
          type: "range",
          startRow: 3,
          startCol: 4,
          endRow: 5,
          endCol: 6,
          value: "y",
          formula: "SUM(A1:A3)",
        },
      ],
    });
  });

  it("builds previews with explicit 1-based row numbers from a celldata slice", () => {
    const preview = buildSheetChangePreview(
      [
        { r: 0, c: 0, v: { v: "A" } },
        { r: 1, c: 1, v: { v: "B", mc: { r: 1, c: 1, rs: 2, cs: 2 } } },
        { r: 2, c: 2, v: { v: "C" } },
      ] as any,
      "Sheet1",
      7,
      storageIndex(0),
      storageIndex(1),
    );

    expect(preview.sheetId).toBe(7);
    expect(preview.sheetName).toBe("Sheet1");
    // range 也是 1-based 工具坐标：minRow0=0 → startRow=1, maxRow0=1 → endRow=2。
    expect(preview.range).toEqual({ startRow: 1, endRow: 2, startCol: 1, endCol: 3 });
    // 行结构携带显式 1-based 行号，前端无需用数组下标推断。
    expect(preview.rows).toEqual([
      { row: 1, values: ["A", "", ""] },
      { row: 2, values: ["", "B", ""] },
    ]);
    expect(preview.merges).toEqual([
      { startRow: 2, startCol: 2, endRow: 2, endCol: 3, clipped: true },
    ]);
    expect(preview.truncated).toBe(false);
  });

  it("clips preview merges to the visible range and omits merges without a visible anchor", () => {
    const preview = buildSheetChangePreview(
      [
        { r: 1, c: 0, v: { v: "visible", mc: { r: 1, c: 0, rs: 3, cs: 1 } } },
        { r: 0, c: 1, v: { v: "outside" } },
      ] as any,
      "Sheet1",
      7,
      storageIndex(1),
      storageIndex(1),
    );

    expect(preview.merges).toEqual([
      { startRow: 2, startCol: 1, endRow: 2, endCol: 1, clipped: true },
    ]);
  });

  it("keeps explicit row numbers in preview when middle rows are empty", () => {
    // minRow0=0, maxRow0=2，但 r=1 没有数据；preview 仍应输出 row=2 的空行。
    const preview = buildSheetChangePreview(
      [
        { r: 0, c: 0, v: { v: "first" } },
        { r: 2, c: 0, v: { v: "third" } },
      ] as any,
      "Sheet1",
      7,
      storageIndex(0),
      storageIndex(2),
    );

    expect(preview.range).toEqual({ startRow: 1, endRow: 3, startCol: 1, endCol: 1 });
    expect(preview.rows).toEqual([
      { row: 1, values: ["first"] },
      { row: 2, values: [""] },
      { row: 3, values: ["third"] },
    ]);
  });

  it("limits previews to the affected range instead of the whole sheet width", () => {
    const celldata = Array.from({ length: 101 }, (_, col) => ({
      r: 0,
      c: col,
      v: { v: String(col) },
    }));
    const preview = buildSheetChangePreview(
      celldata as any,
      "Sheet1",
      7,
      storageIndex(0),
      storageIndex(0),
      { startCol: storageIndex(100), endCol: storageIndex(100) },
    );

    expect(preview.range).toEqual({ startRow: 1, endRow: 1, startCol: 101, endCol: 101 });
    expect(preview.rows).toEqual([{ row: 1, values: ["100"] }]);
    expect(preview.truncated).toBe(false);
  });

  it("applies merge and clear operations to a cell map", () => {
    const cellMap = new Map<string, any>([
      ["0,0", { r: 0, c: 0, v: { v: "keep" } }],
      ["1,1", { r: 1, c: 1, v: { v: "merge", mc: { r: 1, c: 1, rs: 1, cs: 1 } } }],
      ["3,3", { r: 3, c: 3, v: { v: 3, m: "3", f: "A1+B1" } }],
    ]);

    applyMergeOperation(cellMap, {
      startRow: storageIndex(1),
      startCol: storageIndex(1),
      endRow: storageIndex(2),
      endCol: storageIndex(2),
    });
    expect(cellMap.get("1,1").v.mc).toEqual({ r: 1, c: 1, rs: 2, cs: 2 });

    const touched = applyClearOperation(cellMap, { type: "cell", row: 3, col: 3 } as any);
    expect(touched).toEqual(["3,3"]);
    expect(cellMap.has("3,3")).toBe(false);
  });

  it("does not count style-only or merged placeholder cells as content changes", () => {
    const cellMap = new Map<string, any>([["0,0", { r: 0, c: 0, v: { bg: "#FFFF00" } }]]);

    expect(applyClearOperation(cellMap, { type: "cell", row: 0, col: 0 } as any)).toEqual([]);
    expect(cellMap.get("0,0").v).toEqual({ bg: "#FFFF00" });

    applyMergeOperation(cellMap, {
      startRow: storageIndex(1),
      startCol: storageIndex(1),
      endRow: storageIndex(2),
      endCol: storageIndex(2),
    });

    expect(applyClearOperation(cellMap, { type: "cell", row: 1, col: 2 } as any)).toEqual([]);
  });

  it("writes formulas and clears old formulas when replacing values", () => {
    const cellMap = new Map<string, any>();
    const touchedCells = new Map<
      string,
      { row: ToolIndex; col: ToolIndex; value: string | number | boolean; formula?: string }
    >();

    applyCellWrite(cellMap, touchedCells, storageIndex(0), storageIndex(0), 3, "A1+B1");
    expect(cellMap.get("0,0").v).toEqual({ v: 3, m: "3", f: "A1+B1" });

    applyCellWrite(cellMap, touchedCells, storageIndex(0), storageIndex(0), "plain text");
    expect(cellMap.get("0,0").v).toEqual({ v: "plain text", m: "plain text" });
  });

  it("distinguishes real content changes from no-op writes", () => {
    const cell = { r: 0, c: 0, v: { v: 3, m: "3" } } as any;
    const before = snapshotCellContent(cell);
    const cellMap = new Map([["0,0", cell]]);
    const touchedCells = new Map<string, any>();

    applyCellWrite(cellMap, touchedCells, storageIndex(0), storageIndex(0), 3);
    expect(cellContentEqual(before, snapshotCellContent(cellMap.get("0,0")))).toBe(true);

    applyCellWrite(cellMap, touchedCells, storageIndex(0), storageIndex(0), 4);
    expect(cellContentEqual(before, snapshotCellContent(cellMap.get("0,0")))).toBe(false);
  });
});
