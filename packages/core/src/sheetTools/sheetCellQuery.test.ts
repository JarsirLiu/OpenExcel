import { describe, expect, it } from "vitest";
import { querySheetCells } from "./sheetCellQuery.js";

describe("querySheetCells", () => {
  it("finds a formatted column without putting style markers into values", () => {
    const matches = querySheetCells(
      [
        { r: 0, c: 1, v: { v: "数量", m: "数量", bg: "#92d050" } },
        { r: 1, c: 1, v: { v: 2, m: "2", bg: "#92D050" } },
        { r: 2, c: 1, v: { v: 0, m: "0", bg: "#92D050" } },
      ],
      { style: { fill: "#92D050" } },
    );

    expect(matches).toEqual([{ range: "B1:B3", count: 3, reason: "fill=#92D050" }]);
  });

  it("matches a formula pattern at the cell level", () => {
    const matches = querySheetCells(
      [
        { r: 0, c: 1, v: { v: 10, m: "10", f: "=A1*10" } },
        { r: 1, c: 1, v: { v: 20, m: "20", f: "=A2*10" } },
      ],
      { formula: { r1c1: "=RC[-1]*10" } },
    );

    expect(matches).toEqual([{ range: "B1:B2", count: 2, reason: "formula=specified" }]);
  });

  it("locates date cells by semantic type", () => {
    const matches = querySheetCells(
      [
        { r: 0, c: 0, v: { v: 44805, m: "2022/9/1", ct: { t: "d", fa: "m/d/yy" } } },
        { r: 1, c: 0, v: { v: 100, m: "100", ct: { t: "n" } } },
      ],
      { valueType: "date" },
    );

    expect(matches).toEqual([{ range: "A1", count: 1, reason: "type=date" }]);
  });

  it("applies the requested range to value, formula, style, and type queries", () => {
    const celldata = [
      { r: 0, c: 0, v: { v: "目标", m: "目标", bg: "#92D050", f: "=A1" } },
      { r: 0, c: 1, v: { v: "目标", m: "目标", bg: "#92D050", f: "=B1" } },
      { r: 1, c: 0, v: { v: "目标", m: "目标", bg: "#92D050", f: "=A2" } },
      { r: 2, c: 0, v: { v: "目标", m: "目标", bg: "#92D050", f: "=A3" } },
    ];
    const range = { startRow: 1, startCol: 1, endRow: 2, endCol: 1 };

    expect(querySheetCells(celldata, { value: "目标" }, { range })).toEqual([
      { range: "A1:A2", count: 2, reason: "value=目标" },
    ]);
    expect(querySheetCells(celldata, { formula: "exists" }, { range })).toEqual([
      { range: "A1:A2", count: 2, reason: "formula=exists" },
    ]);
    expect(querySheetCells(celldata, { style: { fill: "#92D050" } }, { range })).toEqual([
      { range: "A1:A2", count: 2, reason: "fill=#92D050" },
    ]);
    expect(querySheetCells(celldata, { valueType: "formula" }, { range })).toEqual([
      { range: "A1:A2", count: 2, reason: "type=formula" },
    ]);
  });

  it("finds sparse and explicit empty cells without confusing zero with empty", () => {
    const matches = querySheetCells(
      [
        { r: 0, c: 0, v: { v: "商品", m: "商品" } },
        { r: 1, c: 0, v: { v: "可乐", m: "可乐" } },
        { r: 1, c: 1, v: { v: 0, m: "0" } },
        { r: 2, c: 0, v: { v: "雪碧", m: "雪碧" } },
        { r: 2, c: 1, v: { v: "", m: "" } },
      ],
      { valueType: "empty" },
      { range: { startRow: 1, startCol: 1, endRow: 3, endCol: 2 } },
    );

    expect(matches).toEqual([
      { range: "B1", count: 1, reason: "type=empty" },
      { range: "B3", count: 1, reason: "type=empty" },
    ]);
  });

  it("rejects an unbounded empty-cell search that exceeds the query limit", () => {
    expect(() =>
      querySheetCells(
        [{ r: 0, c: 0, v: { v: "A", m: "A" } }],
        { valueType: "empty" },
        { range: { startRow: 1, startCol: 1, endRow: 1_001, endCol: 101 } },
      ),
    ).toThrow("range exceeds the limit");
  });
});
