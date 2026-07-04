import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../repository.js";
import { deleteSheet } from "./deleteSheet.js";

vi.mock("../repository.js", () => ({
  findWorkbookWithSheets: vi.fn(),
  deleteSheetAndReindex: vi.fn(),
}));

const mockedRepo = vi.mocked(repo);

describe("deleteSheet", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns null when the workbook is missing", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue(null as any);

    await expect(deleteSheet(1, 10)).resolves.toBeNull();
    expect(mockedRepo.deleteSheetAndReindex).not.toHaveBeenCalled();
  });

  it("blocks deleting the last remaining sheet", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 1,
      sheets: [{ id: 10, order: 0 }],
    } as any);

    await expect(deleteSheet(1, 10)).resolves.toEqual({
      error: "Workbook must keep at least one sheet",
      statusCode: 409,
    });
    expect(mockedRepo.deleteSheetAndReindex).not.toHaveBeenCalled();
  });

  it("deletes and reindexes remaining sheets", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 1,
      sheets: [
        { id: 10, order: 0 },
        { id: 11, order: 1 },
        { id: 12, order: 2 },
      ],
    } as any);
    mockedRepo.deleteSheetAndReindex.mockResolvedValue(undefined as any);

    await expect(deleteSheet(1, 11)).resolves.toEqual({
      success: true,
      workbookId: 1,
      sheetId: 11,
      order: 1,
    });
    expect(mockedRepo.deleteSheetAndReindex).toHaveBeenCalledWith(1, 11);
  });
});
