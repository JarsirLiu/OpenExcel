import { describe, expect, it } from "vitest";
import {
  buildExcelToolCatalog,
  buildExcelToolContext,
  buildRunToolContext,
  buildWorkspaceToolContext,
  excelToolSpecs,
} from "./index.js";

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
  it("splits workspace-only and run-scoped tool context", () => {
    const workspaceContext = buildWorkspaceToolContext(3);
    const runContext = buildRunToolContext(7, 3);
    const mergedContext = buildExcelToolContext(7, 3);

    expect(workspaceContext).toEqual({
      createWorkbook: { workspaceId: 3 },
      createSheet: { workspaceId: 3 },
      readSheet: { workspaceId: 3 },
    });

    expect(runContext).toEqual({
      writeCells: { runId: 7, workspaceId: 3 },
      clearCells: { runId: 7, workspaceId: 3 },
      mergeCells: { runId: 7, workspaceId: 3 },
      unmergeCells: { runId: 7, workspaceId: 3 },
    });

    expect(mergedContext).toEqual({
      createWorkbook: { workspaceId: 3 },
      createSheet: { workspaceId: 3 },
      readSheet: { workspaceId: 3 },
      writeCells: { runId: 7, workspaceId: 3 },
      clearCells: { runId: 7, workspaceId: 3 },
      mergeCells: { runId: 7, workspaceId: 3 },
      unmergeCells: { runId: 7, workspaceId: 3 },
    });
  });
});
