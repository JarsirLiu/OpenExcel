import { describe, expect, it } from "vitest";
import { buildExcelToolCatalog, buildExcelToolContext, excelToolSpecs } from "./index.js";

describe("buildExcelToolCatalog", () => {
  it("renders a markdown catalog from tool specs", () => {
    const catalog = buildExcelToolCatalog();

    expect(catalog).toContain("**createWorkbook**");
    expect(catalog).toContain("**createSheet**");
    expect(catalog).toContain("**readSheet**");
    expect(catalog).toContain("**writeCells**");
    expect(catalog).toContain(excelToolSpecs.readSheet.description);
  });
});

describe("buildExcelToolContext", () => {
  it("only includes tools that require a run context", () => {
    const context = buildExcelToolContext(7);

    expect(context).toEqual({
      writeCells: { runId: 7 },
      clearCells: { runId: 7 },
      mergeCells: { runId: 7 },
      unmergeCells: { runId: 7 },
    });
    expect(context.readSheet).toBeUndefined();
    expect(context.createWorkbook).toBeUndefined();
    expect(context.createSheet).toBeUndefined();
  });
});
