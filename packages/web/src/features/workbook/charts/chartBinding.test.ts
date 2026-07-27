import type { ChartSpec } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { chartsForSheet } from "./chartBinding";

const chart = (id: string, sheetId: string): ChartSpec =>
  ({
    id,
    workbookId: "7",
    sheetId,
    type: "line",
    anchor: {
      kind: "oneCell",
      from: { row: 0, col: 0 },
      widthEmu: 100,
      heightEmu: 100,
    },
    series: [
      {
        id: `${id}-series`,
        valueRef: { sheetId, start: { row: 0, col: 0 }, end: { row: 1, col: 0 } },
      },
    ],
  }) as ChartSpec;

describe("chartsForSheet", () => {
  it("keeps only charts owned by the active sheet", () => {
    const charts = [chart("chart-1", "11"), chart("chart-2", "12")];

    expect(chartsForSheet(charts, 11).map((item) => item.id)).toEqual(["chart-1"]);
    expect(chartsForSheet(charts, "12").map((item) => item.id)).toEqual(["chart-2"]);
  });
});
