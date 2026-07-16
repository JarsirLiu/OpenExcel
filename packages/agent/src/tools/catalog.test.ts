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
    expect(catalog).toContain("不支持：删除工作簿或 Sheet");
    expect(catalog).toContain("透视表、透视图表、数据透视筛选器、VBA/宏");
    expect(catalog).toContain("不要用写入单元格或其他近似操作强行模拟");
  });
});

describe("buildExcelToolContext", () => {
  it("splits workspace-only and run-scoped tool context", () => {
    const workspaceContext = buildWorkspaceToolContext(3);
    const runContext = buildRunToolContext(7, 3);
    const mergedContext = buildExcelToolContext(7, 3);

    expect(workspaceContext).toEqual({
      readSheet: { workspaceId: 3 },
    });

    expect(runContext).toEqual({
      createWorkbook: { runId: 7, workspaceId: 3 },
      createSheet: { runId: 7, workspaceId: 3 },
      writeCells: { runId: 7, workspaceId: 3 },
      clearCells: { runId: 7, workspaceId: 3 },
      mergeCells: { runId: 7, workspaceId: 3 },
      unmergeCells: { runId: 7, workspaceId: 3 },
    });

    expect(mergedContext).toEqual({
      readSheet: { workspaceId: 3 },
      createWorkbook: { runId: 7, workspaceId: 3 },
      createSheet: { runId: 7, workspaceId: 3 },
      writeCells: { runId: 7, workspaceId: 3 },
      clearCells: { runId: 7, workspaceId: 3 },
      mergeCells: { runId: 7, workspaceId: 3 },
      unmergeCells: { runId: 7, workspaceId: 3 },
    });
  });
});
