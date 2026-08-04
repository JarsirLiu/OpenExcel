import { describe, expect, it } from "vitest";
import { projectSheetOverview, projectSheetTable } from "./sheetDataPresentation.js";
import { parseSheetToolRange } from "./sheetDataProjection.js";

describe("projectSheetTable", () => {
  it("uses one column header row and keeps merge and formula metadata separate", () => {
    const result = projectSheetTable(
      [
        { r: 0, c: 0, v: { v: "销售报表", m: "销售报表", mc: { r: 0, c: 0, rs: 1, cs: 4 } } },
        { r: 1, c: 0, v: { v: "商品", m: "商品" } },
        { r: 1, c: 1, v: { v: "数量", m: "数量" } },
        { r: 1, c: 2, v: { v: "单价", m: "单价" } },
        { r: 1, c: 3, v: { v: "金额", m: "金额" } },
        { r: 2, c: 0, v: { v: "可乐", m: "可乐" } },
        { r: 2, c: 1, v: { v: 10, m: "10" } },
        { r: 2, c: 2, v: { v: 3.5, m: "3.5" } },
        { r: 2, c: 3, v: { v: 35, m: "35", f: "=B3*C3" } },
      ],
      { requestedRange: parseSheetToolRange("A1:D3") },
    );

    expect(result.columns).toEqual(["A", "B", "C", "D"]);
    expect(result.rows).toEqual([
      { row: 1, values: ["销售报表"] },
      { row: 2, values: ["商品", "数量", "单价", "金额"] },
      { row: 3, values: ["可乐", 10, 3.5, 35] },
    ]);
    expect(result.merges).toEqual([{ range: "A1:D1", anchor: "A1", rowSpan: 1, colSpan: 4 }]);
    expect(result.annotations).toContainEqual({ cell: "D3", formula: "=B3*C3" });
  });

  it("renders dates as readable values and retains their number format", () => {
    const result = projectSheetTable(
      [{ r: 0, c: 0, v: { v: 44805, m: "2022-09-01", ct: { t: "d", fa: "yyyy-mm-dd" } } }],
      { requestedRange: parseSheetToolRange("A1:A1") },
    );

    expect(result.rows).toEqual([{ row: 1, values: ["2022-09-01"] }]);
    expect(result.annotations).toEqual([
      { cell: "A1", date: "2022-09-01", numberFormat: "yyyy-mm-dd" },
    ]);
  });
});

describe("projectSheetOverview", () => {
  it("summarizes structure without materializing a dense matrix", () => {
    const result = projectSheetOverview([
      { r: 0, c: 0, v: { v: "商品", m: "商品", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
      { r: 1, c: 0, v: { v: "可乐", m: "可乐" } },
      { r: 1, c: 1, v: { v: 10, m: "10", f: "=A2*10" } },
    ]);

    expect(result.usedRange).toBe("A1:B2");
    expect(result.nonEmptyCellCount).toBe(3);
    expect(result.mergeRanges).toEqual(["A1:B1"]);
    expect(result.formulaPatterns).toEqual([{ formulaR1C1: "=RC[-1]*10", count: 1 }]);
    expect(result.columns).toEqual([
      { column: "A", types: ["string"] },
      { column: "B", types: ["formula"] },
    ]);
    expect(result.styleColors).toEqual([]);
  });

  it("indexes direct fill and font colors for follow-up exact queries", () => {
    const result = projectSheetOverview([
      { r: 0, c: 0, v: { v: "标题", m: "标题", bg: "#fff2cc", fc: "#FF0000" } },
      { r: 1, c: 0, v: { v: "内容", m: "内容", bg: "#FFF2CC", fc: "#FF0000" } },
      { r: 2, c: 0, v: { v: "重点", m: "重点", bg: "#DDEBF7", fc: "#112233" } },
    ]);

    expect(result.styleColors).toEqual([
      { role: "fill", color: "#DDEBF7", name: "浅蓝色 (light blue)", count: 1 },
      { role: "fill", color: "#FFF2CC", name: "浅黄色 (light yellow)", count: 2 },
      { role: "font", color: "#112233", name: "自定义颜色 (custom color)", count: 1 },
      { role: "font", color: "#FF0000", name: "红色 (red)", count: 2 },
    ]);
  });
});
