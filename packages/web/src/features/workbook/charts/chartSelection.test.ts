import { describe, expect, it } from "vitest";
import { buildChartDraft, normalizeChartSelection } from "./chartSelection";

describe("normalizeChartSelection", () => {
  it("normalizes a FortuneSheet rectangular selection", () => {
    expect(normalizeChartSelection({ row: [1, 4], column: [2, 5] })).toEqual({
      startRow: 1,
      endRow: 4,
      startCol: 2,
      endCol: 5,
    });
  });

  it("rejects a single row or column", () => {
    expect(normalizeChartSelection({ row: [1, 4], column: [2, 2] })).toBeNull();
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
});
