import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { buildChartRenderData } from "./chartData";

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "7",
  sheetId: "11",
  type: "line",
  anchor: {
    kind: "oneCell",
    from: { row: 0, col: 3 },
    widthEmu: 100,
    heightEmu: 200,
  },
  series: [
    {
      id: "series-1",
      name: "销售额",
      categoryRef: { sheetId: "11", start: { row: 0, col: 0 }, end: { row: 2, col: 0 } },
      valueRef: { sheetId: "11", start: { row: 0, col: 1 }, end: { row: 2, col: 1 } },
    },
  ],
};

describe("buildChartRenderData", () => {
  it("reads referenced cells without creating renderer state", () => {
    expect(
      buildChartRenderData(chart, [
        {
          id: 11,
          sheetNo: 1,
          name: "销售",
          order: 0,
          columns: [],
          merges: [],
          config: null,
          revision: 0,
          uploadedData: [
            { r: 0, c: 0, v: { v: "一月" } },
            { r: 0, c: 1, v: { v: 12 } },
            { r: 1, c: 0, v: { v: "二月" } },
            { r: 1, c: 1, v: { v: 18 } },
            { r: 2, c: 0, v: { v: "三月" } },
            { r: 2, c: 1, v: { v: 21 } },
          ],
        },
      ]),
    ).toEqual({
      categories: ["一月", "二月", "三月"],
      series: [{ id: "series-1", name: "销售额", data: [12, 18, 21] }],
    });
  });
});
