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
          type: "range",
          startRow: 1,
          startCol: 1,
          endRow: 1,
          endCol: 10_001,
          value: "x",
        },
      ],
    });

    expect(result.success).toBe(false);
  });
});
