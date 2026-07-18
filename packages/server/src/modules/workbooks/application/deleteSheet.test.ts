import { beforeEach, describe, expect, it, vi } from "vitest";
import { findChartsReferencingSheet } from "../../charts/application/index.js";
import * as repo from "../infrastructure/workbookRepository.js";
import { deleteSheet } from "./deleteSheet.js";

vi.mock("../infrastructure/workbookRepository.js", () => ({
  findWorkbookWithSheets: vi.fn(),
  deleteSheetAndReindex: vi.fn(),
}));

vi.mock("../../charts/application/index.js", () => ({
  findChartsReferencingSheet: vi.fn(),
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  withUndoTrackedMutation: (
    _workspaceId: number,
    resolveSheetIds: () => Promise<number[]>,
    mutation: () => Promise<unknown>,
  ) => resolveSheetIds().then(() => mutation()),
}));

const mockedRepo = vi.mocked(repo);

describe("deleteSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findChartsReferencingSheet).mockResolvedValue([]);
  });

  it("returns null when the workbook is missing", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue(null as any);

    await expect(deleteSheet(1, 1, 10)).resolves.toBeNull();
    expect(mockedRepo.deleteSheetAndReindex).not.toHaveBeenCalled();
  });

  it("blocks deleting the last remaining sheet", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 1,
      sheets: [{ id: 10, order: 0 }],
    } as any);

    await expect(deleteSheet(1, 1, 10)).resolves.toEqual({
      error: "Workbook must keep at least one sheet",
      statusCode: 409,
    });
    expect(mockedRepo.deleteSheetAndReindex).not.toHaveBeenCalled();
  });

  it("deletes and reindexes remaining sheets", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 1,
      sheets: [
        { id: 10, sheetNo: 1, order: 0 },
        { id: 11, sheetNo: 2, order: 1 },
        { id: 12, sheetNo: 3, order: 2 },
      ],
    } as any);
    mockedRepo.deleteSheetAndReindex.mockResolvedValue(undefined as any);

    await expect(deleteSheet(1, 1, 11)).resolves.toEqual({
      success: true,
      workbookId: 1,
      sheetId: 11,
      sheetNo: 2,
      order: 1,
    });
    expect(mockedRepo.deleteSheetAndReindex).toHaveBeenCalledWith(1, 11, 1);
  });

  it("blocks deleting a sheet referenced by a chart", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 1,
      sheets: [
        { id: 10, sheetNo: 1, order: 0 },
        { id: 11, sheetNo: 2, order: 1 },
      ],
    } as any);
    vi.mocked(findChartsReferencingSheet).mockResolvedValue(["chart-1"]);

    await expect(deleteSheet(1, 1, 11)).resolves.toEqual({
      error: "无法删除 Sheet：仍有 1 个图表引用它",
      statusCode: 409,
    });
    expect(mockedRepo.deleteSheetAndReindex).not.toHaveBeenCalled();
  });
});
