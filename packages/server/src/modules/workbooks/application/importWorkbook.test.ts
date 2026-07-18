import { readFile } from "node:fs/promises";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AssetService } from "../../assets/application/assetService.js";
import { ASSET_STATES, type AssetRecord } from "../../assets/domain/asset.js";
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
  function createAsset(overrides: Partial<AssetRecord> = {}): AssetRecord {
    return {
      id: 9,
      publicId: "asset_test",
      workspaceId: 1,
      storageKey: "uploads/1/asset_test/original.xlsx",
      originalFileName: "预算.xlsx",
      detectedFormat: "xlsx",
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      sizeBytes: 2,
      sha256: "hash",
      state: ASSET_STATES.ready,
      ...overrides,
    };
  }

  function createAssets(bytes: Uint8Array, sourceAsset: AssetRecord): AssetService {
    return {
      stageUpload: vi.fn(),
      beginImport: vi.fn(
        async (assetId: number, _workspaceId: number): Promise<AssetRecord> => ({
          ...sourceAsset,
          id: assetId,
          state: ASSET_STATES.importing,
        }),
      ),
      read: vi.fn(async () => bytes),
      markOrphaned: vi.fn(async () => undefined),
      withAssetLease: vi.fn(async (_assetId, action) => action()),
      completeImport: vi.fn(async () => undefined),
    };
  }

  it("returns an invalid payload error for a malformed XLSX container", async () => {
    const sourceAsset = createAsset({ originalFileName: "损坏.xlsx" });
    const assets = createAssets(new Uint8Array([0x50, 0x4b]), sourceAsset);

    await expect(importStoredWorkbook(1, sourceAsset, assets)).rejects.toMatchObject({
      code: "INVALID_IMPORT_PAYLOAD",
      statusCode: 400,
    });
    expect(repository.createImportedWorkbooks).not.toHaveBeenCalled();
    expect(assets.markOrphaned).toHaveBeenCalledWith(9, expect.any(String));
  });

  it("parses the stored source file before opening the import transaction", async () => {
    const sourceAsset = createAsset({
      originalFileName: "库存.csv",
      detectedFormat: "csv",
      mimeType: "text/csv",
      storageKey: "uploads/1/asset_csv/original.csv",
      sizeBytes: 12,
    });
    const assets = createAssets(new TextEncoder().encode("名称,数量\n商品 A,3"), sourceAsset);

    await importStoredWorkbook(1, sourceAsset, assets);

    expect(assets.read).toHaveBeenCalledWith(
      expect.objectContaining({ id: sourceAsset.id, state: ASSET_STATES.importing }),
    );
    expect(repository.createImportedWorkbooks).toHaveBeenCalledWith(
      1,
      [
        expect.objectContaining({
          workbookName: "库存",
          sheetNames: ["Sheet1"],
        }),
      ],
      expect.objectContaining({ id: sourceAsset.id, state: ASSET_STATES.importing }),
      expect.any(Function),
    );
  });

  it("accepts XLSX files whose FortuneExcel config uses class instances", async () => {
    const sourceAsset = createAsset({ originalFileName: "图片.xlsx" });
    const assets = createAssets(new Uint8Array(), sourceAsset);
    vi.mocked(assets.read).mockResolvedValue(
      new Uint8Array(
        await readFile(
          new URL(
            "../../../../../core/node_modules/@corbe30/fortune-excel/test/fixtures/xls_preview.xlsx",
            import.meta.url,
          ),
        ),
      ),
    );

    await importStoredWorkbook(1, sourceAsset, assets);

    expect(repository.createImportedWorkbooks).toHaveBeenCalledWith(
      1,
      [expect.objectContaining({ workbookName: "图片", sheetNames: ["Feuille1"] })],
      expect.objectContaining({ id: sourceAsset.id, state: ASSET_STATES.importing }),
      expect.any(Function),
    );
  });
});
