import { describe, expect, it } from "vitest";
import { buildExcelToolCatalog, buildExcelToolDefinitions } from "./catalog.js";
import { excelToolSpecs } from "./excelToolContract.js";

describe("Excel tool contract", () => {
  it("builds model definitions and catalog from one Core registry", () => {
    const definitions = buildExcelToolDefinitions();
    const catalog = buildExcelToolCatalog();

    expect(definitions.map((tool) => tool.name)).toEqual(Object.keys(excelToolSpecs));
    expect(catalog).toContain(excelToolSpecs.createChart.description);
    expect(catalog).toContain("不支持：删除工作簿或 Sheet");
  });

  it("rejects invalid chart anchors at the Core contract boundary", () => {
    const result = excelToolSpecs.createChart.inputSchema.safeParse({
      workbookId: 1,
      sheetId: 10,
      type: "line",
      anchor: { kind: "twoCell", from: { row: 1, col: 5 } },
      sourceRange: {
        sheetId: 10,
        startRow: 1,
        startCol: 1,
        endRow: 10,
        endCol: 4,
      },
    });

    expect(result.success).toBe(false);
  });

  it("accepts explicit chart series for non-contiguous data", () => {
    const result = excelToolSpecs.createChart.inputSchema.safeParse({
      workbookId: 1,
      sheetId: 10,
      type: "line",
      anchor: { kind: "absolute", xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
      series: [
        {
          name: "Revenue",
          categoryRef: {
            sheetId: 10,
            startRow: 2,
            startCol: 1,
            endRow: 10,
            endCol: 1,
          },
          valueRef: {
            sheetId: 10,
            startRow: 2,
            startCol: 3,
            endRow: 10,
            endCol: 3,
          },
        },
      ],
    });

    expect(result.success).toBe(true);
  });

  it("accepts doughnut and radar chart types without changing the series contract", () => {
    const common = {
      workbookId: 1,
      sheetId: 10,
      anchor: { kind: "absolute" as const, xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
    };

    expect(
      excelToolSpecs.createChart.inputSchema.safeParse({
        ...common,
        type: "doughnut",
        sourceRange: { sheetId: 10, startRow: 1, startCol: 1, endRow: 10, endCol: 2 },
      }).success,
    ).toBe(true);
    expect(
      excelToolSpecs.createChart.inputSchema.safeParse({
        ...common,
        type: "radar",
        sourceRange: { sheetId: 10, startRow: 1, startCol: 1, endRow: 10, endCol: 3 },
      }).success,
    ).toBe(true);
  });

  it("requires exactly one chart data source", () => {
    const common = {
      workbookId: 1,
      sheetId: 10,
      type: "line" as const,
      anchor: { kind: "absolute" as const, xEmu: 0, yEmu: 0, widthEmu: 100, heightEmu: 100 },
    };
    const sourceRange = { sheetId: 10, startRow: 1, startCol: 1, endRow: 4, endCol: 2 };
    const series = [
      {
        valueRef: {
          sheetId: 10,
          startRow: 1,
          startCol: 2,
          endRow: 4,
          endCol: 2,
        },
      },
    ];

    expect(
      excelToolSpecs.createChart.inputSchema.safeParse({ ...common, sourceRange, series }).success,
    ).toBe(false);
    expect(excelToolSpecs.createChart.inputSchema.safeParse(common).success).toBe(false);
  });

  it("requires every model-visible tool to declare a structured output contract", () => {
    for (const tool of Object.values(excelToolSpecs)) {
      expect(tool.needsRunContext).toEqual(expect.any(Boolean));
      expect(tool.outputSchema.safeParse({}).success).toBe(false);
    }
  });

  it("bounds writeCells range expansion at the shared contract boundary", () => {
    const result = excelToolSpecs.writeCells.inputSchema.safeParse({
      sheetId: 1,
      operations: [
        {
          range: "A1:QZR1",
          value: "x",
        },
      ],
    });

    expect(result.success).toBe(false);
  });

  it("requires explicit date semantics for date writes", () => {
    const valid = excelToolSpecs.writeCells.inputSchema.safeParse({
      sheetId: 1,
      operations: [{ range: "A1", value: "2022-09-01", valueType: "date" }],
    });
    const ordinaryFormula = excelToolSpecs.writeCells.inputSchema.safeParse({
      sheetId: 1,
      operations: [{ range: "A1", formula: "=1" }],
    });
    const invalidDateFormula = excelToolSpecs.writeCells.inputSchema.safeParse({
      sheetId: 1,
      operations: [{ range: "A1", value: "2022-09-01", valueType: "date", formula: "=1" }],
    });

    expect(valid.success).toBe(true);
    expect(ordinaryFormula.success).toBe(true);
    expect(invalidDateFormula.success).toBe(false);
  });

  it("accepts overlapping ranges and applies them in array order", () => {
    const result = excelToolSpecs.writeCells.inputSchema.safeParse({
      sheetId: 1,
      operations: [
        { range: "A1:B2", value: "first" },
        { range: "B2:C3", value: "second" },
      ],
    });

    expect(result.success).toBe(true);
  });
});
