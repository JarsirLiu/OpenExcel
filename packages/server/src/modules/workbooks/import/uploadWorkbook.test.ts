import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => ({
  prisma: {
    $transaction: vi.fn(),
  },
  tx: {
    workspace: {
      update: vi.fn(),
    },
    workbook: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    sheet: {
      create: vi.fn(),
    },
  },
}));

vi.mock("../../../infra/database/db.js", () => ({ prisma: mocks.prisma }));
vi.mock("@openexcel/core", () => ({
  excelToGrid: vi.fn((_file: ArrayBuffer, sheetNames: string[]) =>
    sheetNames.map((name) => ({
      celldata: [{ r: 0, c: 0, v: { v: name } }],
      merges: [],
      config: {},
    })),
  ),
}));

import { uploadAsNewWorkbook } from "./uploadWorkbook.js";

function createWorkbookBuffer(sheetName: string) {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([[sheetName]]), sheetName);
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("uploadAsNewWorkbook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.workspace.update.mockResolvedValue({ id: 1 });
    mocks.tx.workbook.aggregate.mockResolvedValue({ _max: { order: 4 } });
    let workbookId = 10;
    mocks.tx.workbook.create.mockImplementation(async ({ data }) => ({
      id: workbookId++,
      ...data,
    }));
    mocks.tx.sheet.create.mockImplementation(async ({ data }) => ({ id: data.workbookId }));
  });

  it("creates one workbook for each uploaded file in request order", async () => {
    const result = await uploadAsNewWorkbook(1, [
      { buffer: createWorkbookBuffer("First"), fileName: "first.xlsx" },
      { buffer: createWorkbookBuffer("Second"), fileName: "second.xlsx" },
    ]);

    expect(result).toEqual([
      { id: 10, publicId: expect.any(String), name: "first", sheets: 1 },
      { id: 11, publicId: expect.any(String), name: "second", sheets: 1 },
    ]);
    expect(mocks.tx.workspace.update).toHaveBeenCalledTimes(1);
    expect(mocks.tx.workbook.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ data: expect.objectContaining({ order: 5 }) }),
    );
    expect(mocks.tx.workbook.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ data: expect.objectContaining({ order: 6 }) }),
    );
  });

  it("reports the invalid file name and does not start a transaction", async () => {
    await expect(
      uploadAsNewWorkbook(1, [{ buffer: Buffer.from("not an xlsx"), fileName: "broken.xlsx" }]),
    ).rejects.toMatchObject({
      code: "INVALID_EXCEL_FILE",
      details: expect.objectContaining({ fileName: "broken.xlsx" }),
    });

    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
