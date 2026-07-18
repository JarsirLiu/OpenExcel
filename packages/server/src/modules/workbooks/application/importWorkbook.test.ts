import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repository from "../infrastructure/workbookRepository.js";
import { importStoredWorkbook, importWorkbooks, WorkbookImportError } from "./importWorkbook.js";

vi.mock("../infrastructure/workbookRepository.js", () => ({
  createImportedWorkbooks: vi.fn(),
}));

const validSheet = {
  name: "Sheet1",
  celldata: [{ r: 0, c: 0, v: { v: "标题", m: "标题", fc: "#112233" } }],
  merges: [],
  config: { config: { columnlen: { 0: 120 } } },
};

describe("importWorkbooks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(repository.createImportedWorkbooks).mockResolvedValue([]);
  });

  it("normalizes imported sheets and persists them as one batch", async () => {
    await importWorkbooks(1, {
      workbooks: [{ name: "预算", sheets: [validSheet] }],
    });

    expect(repository.createImportedWorkbooks).toHaveBeenCalledWith(1, [
      {
        workbookName: "预算",
        sheetNames: ["Sheet1"],
        results: [validSheet],
      },
    ]);
  });

  it("accepts a valid FortuneSheet filter selection", async () => {
    await importWorkbooks(1, {
      workbooks: [
        {
          name: "预算",
          sheets: [{ ...validSheet, config: { filter_select: { row: [0, 10], column: [0, 4] } } }],
        },
      ],
    });

    expect(repository.createImportedWorkbooks).toHaveBeenCalled();
  });

  it.each([
    { row: [0, 10], column: [4] },
    { row: [10, 0], column: [0, 4] },
    { row: [0, 10], column: [0, 16_384] },
  ])("rejects invalid filter selections", async (filter_select) => {
    await expect(
      importWorkbooks(1, {
        workbooks: [
          {
            name: "预算",
            sheets: [{ ...validSheet, config: { filter_select } as never }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_IMPORT_PAYLOAD" });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });

  it("rejects empty workbooks before opening a transaction", async () => {
    await expect(importWorkbooks(1, { workbooks: [] })).rejects.toBeInstanceOf(WorkbookImportError);
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });

  it("rejects sheets with malformed payloads", async () => {
    await expect(
      importWorkbooks(1, {
        workbooks: [
          {
            name: "预算",
            sheets: [{ ...validSheet, celldata: "invalid" as never }],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_IMPORT_PAYLOAD" });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });

  it.each([
    ["null cell", { ...validSheet, celldata: [null] }],
    [
      "negative cell coordinate",
      { ...validSheet, celldata: [{ ...validSheet.celldata[0], r: -1 }] },
    ],
    ["reversed merge range", { ...validSheet, merges: [{ row: [2, 1], col: [0, 1] }] }],
  ])("rejects %s before persistence", async (_caseName, sheet) => {
    await expect(
      importWorkbooks(1, {
        workbooks: [{ name: "预算", sheets: [sheet as never] }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_IMPORT_PAYLOAD" });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });

  it("rejects duplicate cell coordinates before persistence", async () => {
    await expect(
      importWorkbooks(1, {
        workbooks: [
          {
            name: "预算",
            sheets: [
              {
                ...validSheet,
                celldata: [validSheet.celldata[0], validSheet.celldata[0]],
              },
            ],
          },
        ],
      }),
    ).rejects.toMatchObject({ code: "INVALID_IMPORT_PAYLOAD" });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });

  it("accepts consistent merge anchors and placeholders", async () => {
    await importWorkbooks(1, {
      workbooks: [
        {
          name: "预算",
          sheets: [
            {
              name: "Sheet1",
              celldata: [
                { r: 0, c: 0, v: { v: "标题", m: "标题", mc: { r: 0, c: 0, rs: 2, cs: 2 } } },
                { r: 0, c: 1, v: { v: "", m: "", mc: { r: 0, c: 0 } } },
                { r: 1, c: 0, v: { v: "", m: "", mc: { r: 0, c: 0 } } },
                { r: 1, c: 1, v: { v: "", m: "", mc: { r: 0, c: 0 } } },
              ],
              merges: [{ row: [0, 1], col: [0, 1] }],
              config: {},
            },
          ],
        },
      ],
    });

    expect(repository.createImportedWorkbooks).toHaveBeenCalled();
  });

  it.each([
    [
      "inconsistent merge metadata",
      {
        ...validSheet,
        celldata: [{ r: 0, c: 0, v: { v: "标题", m: "标题", mc: { r: 0, c: 0, rs: 1, cs: 2 } } }],
        merges: [{ row: [0, 0], col: [0, 0] }],
      },
    ],
    [
      "overlapping merge ranges",
      {
        ...validSheet,
        merges: [
          { row: [0, 1], col: [0, 1] },
          { row: [1, 2], col: [1, 2] },
        ],
      },
    ],
  ])("rejects %s before persistence", async (_caseName, sheet) => {
    await expect(
      importWorkbooks(1, {
        workbooks: [{ name: "预算", sheets: [sheet as never] }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_IMPORT_PAYLOAD" });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
  });
});

describe("importStoredWorkbook", () => {
  it("parses the stored source file before opening the import transaction", async () => {
    const sourceAsset = {
      publicId: "asset_csv",
      storageKey: "uploads/1/asset_csv/original.csv",
      originalFileName: "库存.csv",
      detectedFormat: "csv" as const,
      mimeType: "text/csv",
      sizeBytes: 12,
      sha256: "hash",
    };
    const storage = {
      store: vi.fn(),
      read: vi.fn(async () => new TextEncoder().encode("名称,数量\n商品 A,3")),
      delete: vi.fn(),
    };

    await importStoredWorkbook(1, sourceAsset, storage);

    expect(storage.read).toHaveBeenCalledWith(sourceAsset.storageKey);
    expect(repository.createImportedWorkbooks).toHaveBeenCalledWith(
      1,
      [
        expect.objectContaining({
          workbookName: "库存",
          sheetNames: ["Sheet1"],
        }),
      ],
      sourceAsset,
    );
  });

  it("accepts XLSX files whose FortuneExcel config uses class instances", async () => {
    const sourceAsset = {
      publicId: "asset_xlsx",
      storageKey: "uploads/1/asset_xlsx/original.xlsx",
      originalFileName: "图片.xlsx",
      detectedFormat: "xlsx" as const,
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 1,
      sha256: "hash",
    };
    const storage = {
      store: vi.fn(),
      read: vi.fn(
        async () =>
          new Uint8Array(
            await readFile(
              new URL(
                "../../../../../core/node_modules/@corbe30/fortune-excel/test/fixtures/xls_preview.xlsx",
                import.meta.url,
              ),
            ),
          ),
      ),
      delete: vi.fn(),
    };

    await importStoredWorkbook(1, sourceAsset, storage);

    expect(repository.createImportedWorkbooks).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ workbookName: "图片", sheetNames: ["Feuille1"] })],
      sourceAsset,
    );
  });
});
