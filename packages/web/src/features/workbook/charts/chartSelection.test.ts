import { describe, expect, it } from "vitest";
import {
  buildChartDraft,
  chartSelectionError,
  chartSelectionKind,
  normalizeChartSelection,
} from "./chartSelection";

describe("normalizeChartSelection", () => {
  it("normalizes a FortuneSheet rectangular selection", () => {
    expect(normalizeChartSelection({ row: [1, 4], column: [2, 5] })).toEqual({
      startRow: 1,
      endRow: 4,
      startCol: 2,
      endCol: 5,
    });
  });

  it("accepts a single row or column with at least two cells", () => {
    expect(normalizeChartSelection({ row: [1, 1], column: [2, 5] })).toEqual({
      startRow: 1,
      endRow: 1,
      startCol: 2,
      endCol: 5,
    });
    expect(normalizeChartSelection({ row: [1, 4], column: [2, 2] })).toEqual({
      startRow: 1,
      endRow: 4,
      startCol: 2,
      endCol: 2,
    });
  });

  it("rejects a single cell", () => {
    expect(normalizeChartSelection({ row: [1, 1], column: [2, 2] })).toBeNull();
  });
});

describe("chartSelectionKind", () => {
  it("classifies one-dimensional and table selections", () => {
    expect(chartSelectionKind({ startRow: 0, endRow: 0, startCol: 0, endCol: 2 })).toBe("row");
    expect(chartSelectionKind({ startRow: 0, endRow: 2, startCol: 0, endCol: 0 })).toBe("column");
    expect(chartSelectionKind({ startRow: 0, endRow: 2, startCol: 0, endCol: 2 })).toBe("table");
  });
});

describe("buildChartDraft", () => {
  it("creates category and series references from a table selection", () => {
    const draft = buildChartDraft({
      workbookId: 7,
      sheetId: 11,
      selection: { startRow: 0, endRow: 3, startCol: 0, endCol: 2 },
      type: "line",
      title: "销售趋势",
    });

    expect(draft).toMatchObject({
      workbookId: "7",
      sheetId: "11",
      type: "line",
      title: "销售趋势",
    });
    expect(draft.series).toEqual([
      {
        id: "series-1",
        name: { sheetId: "11", start: { row: 0, col: 1 }, end: { row: 0, col: 1 } },
        categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
        valueRef: { sheetId: "11", start: { row: 1, col: 1 }, end: { row: 3, col: 1 } },
      },
      {
        id: "series-2",
        name: { sheetId: "11", start: { row: 0, col: 2 }, end: { row: 0, col: 2 } },
        categoryRef: { sheetId: "11", start: { row: 1, col: 0 }, end: { row: 3, col: 0 } },
        valueRef: { sheetId: "11", start: { row: 1, col: 2 }, end: { row: 3, col: 2 } },
      },
    ]);
  });

  it("creates one horizontal series from a single row", () => {
    const draft = buildChartDraft({
      workbookId: 7,
      sheetId: 11,
      selection: { startRow: 2, endRow: 2, startCol: 1, endCol: 4 },
      type: "bar",
    });

    expect(draft.series).toEqual([
      {
        id: "series-1",
        valueRef: { sheetId: "11", start: { row: 2, col: 1 }, end: { row: 2, col: 4 } },
      },
    ]);
  });

  it("creates one vertical series from a single column", () => {
    const draft = buildChartDraft({
      workbookId: 7,
      sheetId: 11,
      selection: { startRow: 1, endRow: 4, startCol: 3, endCol: 3 },
      type: "line",
    });

    expect(draft.series).toEqual([
      {
        id: "series-1",
        valueRef: { sheetId: "11", start: { row: 1, col: 3 }, end: { row: 4, col: 3 } },
      },
    ]);
  });

  it("keeps chart types that require paired dimensions explicit", () => {
    const row = { startRow: 0, endRow: 0, startCol: 0, endCol: 2 };
    expect(chartSelectionError(row, "pie")).toContain("两列数据");
    expect(chartSelectionError(row, "scatter")).toContain("二维数据");
  });
});
