import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { ChartValidationError } from "./chart.js";
import { normalizeChartSpecForSheets } from "./chartDataValidation.js";

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "7",
  sheetId: "11",
  type: "line",
  anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
  series: [
    {
      id: "revenue",
      name: "Revenue",
      categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      valueRef: { sheetId: "11", start: { row: 1, col: 2 }, end: { row: 2, col: 2 } },
    },
    {
      id: "profit",
      name: "Profit",
      categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 2, col: 0 } },
      valueRef: { sheetId: "11", start: { row: 1, col: 12 }, end: { row: 2, col: 12 } },
    },
  ],
};

describe("normalizeChartSpecForSheets", () => {
  it("keeps explicit series references even when one series has no numeric values", () => {
    const normalized = normalizeChartSpecForSheets(chart, [
      {
        id: "11",
        celldata: [{ r: 1, c: 2, v: { v: 12, m: "12" } }],
      },
    ]);

    expect(normalized.series).toEqual(chart.series);
  });

  it("rejects a chart when every series lacks a numeric value", () => {
    expect(() =>
      normalizeChartSpecForSheets(chart, [
        {
          id: "11",
          celldata: [{ r: 1, c: 2, v: { v: "暂无", m: "暂无" } }],
        },
      ]),
    ).toThrow(ChartValidationError);
  });
});
