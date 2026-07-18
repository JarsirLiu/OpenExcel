import { describe, expect, it } from "vitest";
import { materializeImportedChart } from "./importedChart.js";

describe("materializeImportedChart", () => {
  it("maps imported sheet keys to domain sheet ids", () => {
    const chart = materializeImportedChart(
      {
        id: "source-chart",
        sheetKey: "sheet-0",
        type: "line",
        anchor: {
          kind: "oneCell",
          from: { row: 1, col: 2 },
          widthEmu: 1000,
          heightEmu: 2000,
        },
        series: [
          {
            id: "series-1",
            name: "销售额",
            categoryRef: {
              sheetKey: "sheet-0",
              start: { row: 0, col: 0 },
              end: { row: 2, col: 0 },
            },
            valueRef: {
              sheetKey: "sheet-1",
              start: { row: 0, col: 1 },
              end: { row: 2, col: 1 },
            },
          },
        ],
      },
      {
        chartId: "chart-1",
        workbookId: "7",
        sheetIdByKey: new Map([
          ["sheet-0", "11"],
          ["sheet-1", "12"],
        ]),
      },
    );

    expect(chart).toMatchObject({
      id: "chart-1",
      workbookId: "7",
      sheetId: "11",
      series: [{ categoryRef: { sheetId: "11" }, valueRef: { sheetId: "12" } }],
    });
  });
});
