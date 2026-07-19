import { describe, expect, it } from "vitest";
import { parseSheetToolRange, projectSheetData, sheetUsedRange } from "./sheetDataProjection.js";

describe("projectSheetData", () => {
  it.each(["A0", "A1:A0", "XFE1", "A1048577"])("rejects an invalid Excel range: %s", (range) => {
    expect(() => parseSheetToolRange(range)).toThrow("Invalid sheet range");
  });

  it("returns a compact rectangular matrix and preserves null versus zero", () => {
    const result = projectSheetData([
      { r: 0, c: 0, v: { v: "商品", m: "商品" } },
      { r: 0, c: 1, v: { v: "数量", m: "数量" } },
      { r: 1, c: 0, v: { v: "可乐", m: "可乐" } },
      { r: 1, c: 1, v: { v: 0, m: "0" } },
    ]);

    expect(result.range).toBe("A1:B2");
    expect(result.values).toEqual([
      ["商品", "数量"],
      ["可乐", 0],
    ]);
    expect(result.continuation).toBeNull();
  });

  it("compresses repeated relative formulas into one pattern", () => {
    const result = projectSheetData([
      { r: 0, c: 0, v: { v: 1, m: "1" } },
      { r: 0, c: 1, v: { v: 10, m: "10", f: "=A1*10" } },
      { r: 1, c: 0, v: { v: 2, m: "2" } },
      { r: 1, c: 1, v: { v: 20, m: "20", f: "=A2*10" } },
      { r: 2, c: 0, v: { v: 3, m: "3" } },
      { r: 2, c: 1, v: { v: 30, m: "30", f: "=A3*10" } },
    ]);

    expect(result.formulaPatterns).toEqual([{ ranges: ["B1:B3"], formulaR1C1: "=RC[-1]*10" }]);
    expect(result.formulaExceptions).toEqual([]);
  });

  it("compresses repeated horizontal formulas into one pattern", () => {
    const result = projectSheetData([
      { r: 0, c: 0, v: { v: 1, m: "1" } },
      { r: 0, c: 1, v: { v: 10, m: "10", f: "=A1*10" } },
      { r: 0, c: 2, v: { v: 20, m: "20", f: "=B1*10" } },
      { r: 0, c: 3, v: { v: 30, m: "30", f: "=C1*10" } },
    ]);

    expect(result.formulaPatterns).toEqual([{ ranges: ["B1:D1"], formulaR1C1: "=RC[-1]*10" }]);
    expect(result.formulaExceptions).toEqual([]);
  });

  it("calculates the used range without expanding a large cell list into arguments", () => {
    const cells = Array.from({ length: 130_000 }, (_, row) => ({
      r: row,
      c: 0,
      v: { v: row, m: String(row) },
    }));

    expect(sheetUsedRange(cells)).toEqual({
      startRow: 1,
      startCol: 1,
      endRow: 130_000,
      endCol: 1,
    });
  });

  it("returns full merge metadata and anchor value when a range clips the merge", () => {
    const result = projectSheetData(
      [{ r: 0, c: 0, v: { v: "标题", m: "标题", mc: { r: 0, c: 0, rs: 1, cs: 3 } } }],
      { requestedRange: parseSheetToolRange("B1:C1") },
    );

    expect(result.values).toEqual([[null, null]]);
    expect(result.merges).toEqual([
      {
        range: "A1:C1",
        anchor: "A1",
        rowSpan: 1,
        colSpan: 3,
        clipped: true,
        anchorValue: "标题",
      },
    ]);
  });

  it("returns a structured continuation without dropping middle rows", () => {
    const cells = Array.from({ length: 10 }, (_, row) => ({
      r: row,
      c: 0,
      v: { v: row, m: String(row) },
    }));
    const result = projectSheetData(cells, {
      requestedRange: parseSheetToolRange("A1:A10"),
      maxCells: 4,
    });

    expect(result.range).toBe("A1:A4");
    expect(result.continuation).toEqual({
      requestedRange: parseSheetToolRange("A1:A10"),
      nextRow: 5,
      nextCol: 1,
    });
  });
});
