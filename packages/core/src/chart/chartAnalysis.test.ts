import { describe, expect, it } from "vitest";
import { chartDependencySheetIds, inspectChartData, resolveChartData } from "./chartAnalysis.js";
import { parseChartSpec } from "./chartModel.js";

const chart = parseChartSpec({
  id: "chart-1",
  workbookId: "workbook-1",
  sheetId: "sheet-1",
  type: "line",
  anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
  series: [
    {
      id: "series-1",
      name: {
        sheetId: "sheet-2",
        start: { row: 0, col: 0 },
        end: { row: 0, col: 0 },
      },
      categoryRef: {
        sheetId: "sheet-1",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
      valueRef: {
        sheetId: "sheet-2",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    },
  ],
});

describe("chart analysis", () => {
  it("returns every sheet that can affect a chart", () => {
    expect(chartDependencySheetIds(chart)).toEqual(["sheet-1", "sheet-2"]);
  });

  it("resolves vertical references using one shared range rule", () => {
    expect(
      resolveChartData(chart, [
        {
          id: "sheet-1",
          celldata: [
            { r: 0, c: 0, v: { v: "一月", m: "一月" } },
            { r: 1, c: 0, v: { v: "二月", m: "二月" } },
            { r: 2, c: 0, v: { v: "三月", m: "三月" } },
          ],
        },
        {
          id: "sheet-2",
          celldata: [
            { r: 0, c: 0, v: { v: "销售额", m: "销售额" } },
            { r: 0, c: 1, v: { v: 12, m: "12" } },
            { r: 1, c: 1, v: { v: 18, m: "18" } },
            { r: 2, c: 1, v: { v: 21, m: "21" } },
          ],
        },
      ]),
    ).toEqual({
      categories: ["一月", "二月", "三月"],
      series: [{ id: "series-1", name: "销售额", data: [12, 18, 21] }],
    });
  });

  it("reports missing values and formula cells without evaluating formulas", () => {
    const quality = inspectChartData(
      parseChartSpec({
        ...chart,
        series: chart.series,
      }),
      [
        {
          id: "sheet-1",
          celldata: [
            { r: 0, c: 0, v: { v: "一月", m: "一月" } },
            { r: 1, c: 0, v: { v: "二月", m: "二月" } },
            { r: 2, c: 0, v: { v: "三月", m: "三月" } },
          ],
        },
        {
          id: "sheet-2",
          celldata: [
            { r: 0, c: 0, v: { v: "销售额", m: "销售额" } },
            { r: 0, c: 1, v: { v: 12, m: "12", f: "=A1" } },
            { r: 1, c: 1, v: { v: null, m: "", f: "=A2" } },
            { r: 2, c: 1, v: { v: "暂无", m: "暂无" } },
          ],
        },
      ],
    );

    expect(quality.series[0]).toMatchObject({
      pointCount: 3,
      missingValueIndexes: [1],
      nonNumericValueIndexes: [2],
      formulaCells: ["B1", "B2"],
      unresolvedFormulaCells: ["B2"],
    });
  });
});
