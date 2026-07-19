import { describe, expect, it } from "vitest";
import { toCreateChartSpec, toUpdateChartPatch } from "./chartToolInput.js";

const sourceRange = {
  sheetId: 11,
  startRow: 1,
  startCol: 1,
  endRow: 5,
  endCol: 3,
};

describe("chartToolInput", () => {
  it("converts a rectangular AI source range to normalized series references", () => {
    const spec = toCreateChartSpec(
      {
        workbookId: 7,
        sheetId: 11,
        type: "line",
        anchor: {
          kind: "twoCell",
          from: { row: 1, col: 4 },
          to: { row: 16, col: 11 },
        },
        sourceRange,
      },
      "chart-1",
    );

    expect(spec).toMatchObject({
      id: "chart-1",
      workbookId: "7",
      sheetId: "11",
      anchor: { from: { row: 0, col: 3 }, to: { row: 15, col: 10 } },
      series: [
        {
          name: { sheetId: "11", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
          categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 4, col: 0 } },
          valueRef: { sheetId: "11", start: { row: 1, col: 1 }, end: { row: 4, col: 1 } },
        },
        {
          categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 4, col: 0 } },
          valueRef: { sheetId: "11", start: { row: 1, col: 2 }, end: { row: 4, col: 2 } },
        },
      ],
    });
  });

  it("passes combo series types without accepting concrete data", () => {
    const spec = toCreateChartSpec(
      {
        workbookId: 7,
        sheetId: 11,
        type: "combo",
        seriesTypes: ["line", "area"],
        anchor: { kind: "oneCell", from: { row: 1, col: 4 }, widthEmu: 100, heightEmu: 200 },
        sourceRange,
      },
      "chart-combo",
    );

    expect(spec.series.map((item) => item.chartType)).toEqual(["line", "area"]);
  });

  it("converts update references without changing omitted fields", () => {
    expect(
      toUpdateChartPatch({
        title: null,
        sheetId: 12,
        anchor: {
          kind: "oneCell",
          from: { row: 3, col: 2 },
          widthEmu: 100,
          heightEmu: 200,
        },
      }),
    ).toEqual({
      type: undefined,
      title: null,
      sheetId: "12",
      anchor: {
        kind: "oneCell",
        from: { row: 2, col: 1 },
        widthEmu: 100,
        heightEmu: 200,
      },
      series: undefined,
    });
  });
});
