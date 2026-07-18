import { describe, expect, it } from "vitest";
import { applyChartCommand, ChartCommandError } from "./chartCommands.js";
import { chartSpecSchema, isChartSpec, parseChartSpec } from "./chartModel.js";
import { cellAddressToA1, rangeReferenceToA1 } from "./chartReference.js";

function chart(): ReturnType<typeof parseChartSpec> {
  return parseChartSpec({
    id: "chart-1",
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    type: "bar",
    anchor: {
      kind: "twoCell",
      from: { row: 1, col: 1 },
      to: { row: 15, col: 8 },
    },
    series: [
      {
        id: "series-1",
        categoryRef: {
          sheetId: "sheet-1",
          start: { row: 1, col: 0 },
          end: { row: 5, col: 0 },
        },
        valueRef: {
          sheetId: "sheet-1",
          start: { row: 1, col: 1 },
          end: { row: 5, col: 1 },
        },
      },
    ],
  });
}

describe("chart model", () => {
  it("validates a two-cell chart without depending on a renderer", () => {
    const chart = parseChartSpec({
      id: "chart-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      type: "bar",
      anchor: {
        kind: "twoCell",
        from: { row: 1, col: 1 },
        to: { row: 15, col: 8 },
      },
      series: [
        {
          id: "series-1",
          name: "销售额",
          categoryRef: {
            sheetId: "sheet-1",
            start: { row: 1, col: 0 },
            end: { row: 5, col: 0 },
          },
          valueRef: {
            sheetId: "sheet-1",
            start: { row: 1, col: 1 },
            end: { row: 5, col: 1 },
          },
        },
      ],
    });

    expect(chart.anchor.kind).toBe("twoCell");
    expect(isChartSpec(chart)).toBe(true);
  });

  it("requires dimensions for one-cell anchors", () => {
    const result = chartSpecSchema.safeParse({
      ...chart(),
      anchor: { kind: "oneCell", from: { row: 1, col: 1 } },
    });

    expect(result.success).toBe(false);
  });

  it("rejects incomplete or invalid chart anchors", () => {
    const result = chartSpecSchema.safeParse({
      id: "chart-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      type: "line",
      anchor: {
        kind: "twoCell",
        from: { row: 4, col: 4 },
        to: { row: 2, col: 4 },
      },
      series: [
        {
          id: "series-1",
          valueRef: {
            sheetId: "sheet-1",
            start: { row: 0, col: 0 },
            end: { row: 1, col: 0 },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires categories for pie charts", () => {
    const result = chartSpecSchema.safeParse({
      id: "chart-1",
      workbookId: "workbook-1",
      sheetId: "sheet-1",
      type: "pie",
      anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 1, heightEmu: 1 },
      series: [
        {
          id: "series-1",
          valueRef: {
            sheetId: "sheet-1",
            start: { row: 0, col: 1 },
            end: { row: 3, col: 1 },
          },
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});

describe("chart references", () => {
  it("converts zero-based addresses to absolute A1 references", () => {
    expect(cellAddressToA1({ row: 0, col: 0 }, true)).toBe("$A$1");
    expect(cellAddressToA1({ row: 9, col: 26 }, true)).toBe("$AA$10");
  });

  it("quotes sheet names when producing Excel references", () => {
    expect(
      rangeReferenceToA1(
        {
          sheetId: "sheet-1",
          start: { row: 0, col: 0 },
          end: { row: 4, col: 2 },
        },
        "销售'明细",
      ),
    ).toBe("'销售''明细'!$A$1:$C$5");
  });
});

describe("applyChartCommand", () => {
  it("returns an inverse command for an inserted chart", () => {
    const result = applyChartCommand([], { type: "chart.insert", chart: chart() });

    expect(result.charts).toHaveLength(1);
    expect(result.inverse).toEqual({ type: "chart.delete", chartId: "chart-1" });
  });

  it("updates and restores chart state without mutating the input", () => {
    const original = chart();
    const result = applyChartCommand([original], {
      type: "chart.update",
      chartId: original.id,
      patch: { title: "销售趋势", type: "line" },
    });

    expect(original.title).toBeUndefined();
    expect(result.charts[0]?.title).toBe("销售趋势");
    expect(result.charts[0]?.type).toBe("line");

    const restored = applyChartCommand(result.charts, result.inverse);
    expect(restored.charts).toEqual([original]);
  });

  it("rejects duplicate and missing chart commands", () => {
    expect(() => applyChartCommand([chart()], { type: "chart.insert", chart: chart() })).toThrow(
      ChartCommandError,
    );
    expect(() => applyChartCommand([], { type: "chart.delete", chartId: "missing-chart" })).toThrow(
      ChartCommandError,
    );
  });
});
