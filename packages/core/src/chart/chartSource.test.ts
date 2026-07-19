import { describe, expect, it } from "vitest";
import {
  ChartSourceRangeError,
  chartSeriesFromSourceRange,
  chartSourceRangeKind,
} from "./chartSource.js";

const source = {
  sheetId: "sheet-1",
  start: { row: 0, col: 0 },
  end: { row: 3, col: 2 },
};

describe("chartSourceRange", () => {
  it("classifies row, column, and table source ranges", () => {
    expect(chartSourceRangeKind({ ...source, end: { row: 0, col: 2 } })).toBe("row");
    expect(chartSourceRangeKind({ ...source, end: { row: 3, col: 0 } })).toBe("column");
    expect(chartSourceRangeKind(source)).toBe("table");
  });

  it("expands a rectangular table into shared categories and multiple series", () => {
    expect(chartSeriesFromSourceRange(source, "line")).toEqual([
      {
        id: "series-1",
        name: { sheetId: "sheet-1", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
        categoryRef: { sheetId: "sheet-1", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
        valueRef: { sheetId: "sheet-1", start: { row: 1, col: 1 }, end: { row: 3, col: 1 } },
      },
      {
        id: "series-2",
        name: { sheetId: "sheet-1", start: { row: 0, col: 2 }, end: { row: 0, col: 2 } },
        categoryRef: { sheetId: "sheet-1", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
        valueRef: { sheetId: "sheet-1", start: { row: 1, col: 2 }, end: { row: 3, col: 2 } },
      },
    ]);
  });

  it("keeps single-row and single-column sources as valid series", () => {
    expect(
      chartSeriesFromSourceRange(
        { sheetId: "sheet-1", start: { row: 2, col: 1 }, end: { row: 2, col: 3 } },
        "bar",
      )[0]?.valueRef,
    ).toEqual({ sheetId: "sheet-1", start: { row: 2, col: 1 }, end: { row: 2, col: 3 } });
    expect(
      chartSeriesFromSourceRange(
        { sheetId: "sheet-1", start: { row: 1, col: 2 }, end: { row: 3, col: 2 } },
        "bar",
      )[0]?.valueRef,
    ).toEqual({ sheetId: "sheet-1", start: { row: 1, col: 2 }, end: { row: 3, col: 2 } });
  });

  it("enforces chart-specific table requirements", () => {
    expect(() =>
      chartSeriesFromSourceRange(
        { sheetId: "sheet-1", start: { row: 0, col: 0 }, end: { row: 3, col: 1 } },
        "pie",
      ),
    ).not.toThrow();
    expect(() =>
      chartSeriesFromSourceRange(
        { sheetId: "sheet-1", start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
        "pie",
      ),
    ).toThrow(ChartSourceRangeError);
    expect(() =>
      chartSeriesFromSourceRange(
        { sheetId: "sheet-1", start: { row: 0, col: 0 }, end: { row: 0, col: 2 } },
        "scatter",
      ),
    ).toThrow(ChartSourceRangeError);
  });

  it("preserves explicit series types for combo charts", () => {
    const series = chartSeriesFromSourceRange(source, "combo", ["line", "area"]);

    expect(series.map((item) => item.chartType)).toEqual(["line", "area"]);
    expect(() => chartSeriesFromSourceRange(source, "combo", ["line"])).toThrow(
      ChartSourceRangeError,
    );
  });
});
