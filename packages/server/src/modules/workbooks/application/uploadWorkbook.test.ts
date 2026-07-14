import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

vi.mock("../infrastructure/workbookRepository.js", () => ({
  createUploadedWorkbooks: vi.fn(),
}));
vi.mock("@openexcel/core", () => ({
  excelToGrid: vi.fn((_file: ArrayBuffer, sheetNames: string[]) =>
    sheetNames.map((name) => ({
      celldata: [{ r: 0, c: 0, v: { v: name } }],
      merges: [],
      config: {},
    })),
  ),
}));

import * as repository from "../infrastructure/workbookRepository.js";
import { uploadAsNewWorkbook } from "./uploadWorkbook.js";

function createWorkbookBuffer(sheetName: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[sheetName]]), sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("uploadAsNewWorkbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.createUploadedWorkbooks).mockResolvedValue([]);
  });

  it("creates one workbook for each uploaded file in request order", async () => {
    const result = await uploadAsNewWorkbook(1, [
      { buffer: createWorkbookBuffer("First"), fileName: "first.xlsx" },
      { buffer: createWorkbookBuffer("Second"), fileName: "second.xlsx" },
    ]);

    expect(repository.createUploadedWorkbooks).toHaveBeenCalledWith(
      1,
      expect.arrayContaining([
        expect.objectContaining({ workbookName: "first", sheetNames: ["First"] }),
        expect.objectContaining({ workbookName: "second", sheetNames: ["Second"] }),
      ]),
    );
  });

  it("reports the invalid file name and does not start a transaction", async () => {
    await expect(
      uploadAsNewWorkbook(1, [{ buffer: Buffer.from("not an xlsx"), fileName: "broken.xlsx" }]),
    ).rejects.toMatchObject({
      code: "INVALID_EXCEL_FILE",
      details: expect.objectContaining({ fileName: "broken.xlsx" }),
    });

    expect(repository.createUploadedWorkbooks).not.toHaveBeenCalled();
  });
});
