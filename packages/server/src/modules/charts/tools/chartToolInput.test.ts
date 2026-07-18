import { describe, expect, it } from "vitest";
import { toCreateChartSpec, toUpdateChartPatch } from "./chartToolInput.js";

const range = {
  sheetId: 11,
  startRow: 2,
  startCol: 1,
  endRow: 5,
  endCol: 2,
};

describe("chartToolInput", () => {
  it("converts AI visual coordinates to core zero-based references", () => {
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
        series: [{ id: "series-1", name: "金额", categoryRef: range, valueRef: range }],
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
          categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 4, col: 1 } },
        },
      ],
    });
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
