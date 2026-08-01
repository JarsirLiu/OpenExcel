import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { chartAffectsChange } from "./ChartInvalidationIndex";

const chart: ChartSpec = {
  id: "chart-1",
  workbookId: "1",
  sheetId: "10",
  type: "line",
  anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
  series: [
    {
      id: "series-1",
      categoryRef: {
        sheetId: "10",
        start: { row: 0, col: 0 },
        end: { row: 2, col: 0 },
      },
      valueRef: {
        sheetId: "10",
        start: { row: 0, col: 1 },
        end: { row: 2, col: 1 },
      },
    },
  ],
};

describe("chartAffectsChange", () => {
  it("ignores unrelated cells and invalidates referenced cells", () => {
    expect(
      chartAffectsChange(chart, {
        kind: "sheet",
        sheetId: 10,
        cells: [{ row: 4, col: 4 }],
        structural: false,
        configChanged: false,
      }),
    ).toBe(false);
    expect(
      chartAffectsChange(chart, {
        kind: "sheet",
        sheetId: 10,
        cells: [{ row: 1, col: 1 }],
        structural: false,
        configChanged: false,
      }),
    ).toBe(true);
  });

  it("invalidates structural sheet replacements conservatively", () => {
    expect(
      chartAffectsChange(chart, {
        kind: "sheet",
        sheetId: 10,
        cells: [],
        structural: true,
        configChanged: true,
      }),
    ).toBe(true);
  });

  it("ignores layout-only changes", () => {
    expect(
      chartAffectsChange(chart, {
        kind: "sheet",
        sheetId: 10,
        cells: [],
        structural: false,
        configChanged: true,
      }),
    ).toBe(false);
  });
});
