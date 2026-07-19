import { describe, expect, it } from "vitest";
import { projectSheetObjects, UnsupportedSheetObjectTypeError } from "./sheetObjectProjection.js";

describe("projectSheetObjects", () => {
  it("projects charts as references instead of rendering payloads", () => {
    const objects = projectSheetObjects(
      {
        sheetId: "1",
        sheetName: "销售",
        sheetNames: new Map([["1", "销售"]]),
        config: null,
        charts: [
          {
            id: "chart-1",
            workbookId: "1",
            sheetId: "1",
            type: "bar",
            anchor: { kind: "twoCell", from: { row: 1, col: 4 }, to: { row: 10, col: 12 } },
            series: [
              {
                id: "series-1",
                categoryRef: {
                  sheetId: "1",
                  start: { row: 1, col: 0 },
                  end: { row: 9, col: 0 },
                },
                valueRef: {
                  sheetId: "1",
                  start: { row: 1, col: 1 },
                  end: { row: 9, col: 1 },
                },
              },
            ],
          },
        ],
      },
      "charts",
    );

    expect(objects).toEqual([
      {
        kind: "chart",
        id: "chart-1",
        type: "bar",
        title: null,
        anchor: "E2:M11",
        series: [
          {
            id: "series-1",
            name: null,
            categoryRange: "'销售'!$A$2:$A$10",
            valueRange: "'销售'!$B$2:$B$10",
            chartType: null,
          },
        ],
      },
    ]);
  });

  it("projects a filter selection independently from charts", () => {
    expect(
      projectSheetObjects(
        {
          sheetId: "1",
          sheetName: "销售",
          sheetNames: new Map([["1", "销售"]]),
          config: { filter_select: { row: [0, 10], column: [0, 3] } },
          charts: [],
        },
        "filters",
      ),
    ).toEqual([{ kind: "filter", range: "A1:D11" }]);
  });

  it("does not report unmodeled Excel objects as an empty result", () => {
    expect(() =>
      projectSheetObjects(
        {
          sheetId: "1",
          sheetName: "销售",
          sheetNames: new Map([["1", "销售"]]),
          config: null,
          charts: [],
        },
        "pivotTables",
      ),
    ).toThrowError(UnsupportedSheetObjectTypeError);
  });
});
