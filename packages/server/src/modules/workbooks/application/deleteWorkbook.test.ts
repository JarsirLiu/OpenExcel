import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repo from "../infrastructure/workbookRepository.js";
import { deleteWorkbook } from "./deleteWorkbook.js";

vi.mock("../infrastructure/workbookRepository.js", () => ({
  findWorkbookWithSheets: vi.fn(),
  deleteWorkbook: vi.fn(),
}));

vi.mock("../../sessions/runs/undoCheckpoint.js", () => ({
  withUndoTrackedSheetMutation: (
    _workspaceId: number,
    _sheetIds: number[],
    mutation: () => Promise<unknown>,
  ) => mutation(),
}));

const mockedRepo = vi.mocked(repo);

describe("deleteWorkbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows deleting the last workbook in a workspace", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue({
      id: 7,
      sheets: [{ id: 11 }],
    } as any);
    mockedRepo.deleteWorkbook.mockResolvedValue(undefined as any);

    await expect(deleteWorkbook(3, 7)).resolves.toEqual({ success: true });
    expect(mockedRepo.deleteWorkbook).toHaveBeenCalledWith(7, 3);
  });

  it("returns not found without mutating another workspace", async () => {
    mockedRepo.findWorkbookWithSheets.mockResolvedValue(null);

    await expect(deleteWorkbook(3, 7)).resolves.toEqual({
      error: "Workbook not found",
      statusCode: 404,
    });
    expect(mockedRepo.deleteWorkbook).not.toHaveBeenCalled();
  });
});
