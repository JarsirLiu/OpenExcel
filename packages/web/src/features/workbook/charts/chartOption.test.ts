import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { buildChartOption } from "./chartOption";

const chart = {
  id: "chart-1",
  workbookId: "workbook-1",
  sheetId: "sheet-1",
  type: "line",
  title: "各产品季度销售额对比",
  anchor: { kind: "absolute", x: 0, y: 0, width: 400, height: 240 },
  series: [
    {
      id: "series-1",
      name: "一季度",
      categoryRef: { sheetId: "sheet-1", start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      valueRef: { sheetId: "sheet-1", start: { row: 0, col: 1 }, end: { row: 1, col: 1 } },
    },
  ],
} as unknown as ChartSpec;

describe("buildChartOption", () => {
  it("reserves separate vertical areas for a titled multi-series chart", () => {
    const option = buildChartOption(chart, {
      categories: ["产品 A"],
      series: [
        { id: "series-1", name: "一季度", data: [100] },
        { id: "series-2", name: "二季度", data: [120] },
      ],
    });

    expect(option.title).toMatchObject({ top: 8 });
    expect(option.legend).toMatchObject({ top: 38 });
    expect(option.grid).toMatchObject({ top: 72 });
  });
});
