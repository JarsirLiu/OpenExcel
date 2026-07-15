import { beforeEach, describe, expect, it, vi } from "vitest";
import * as repository from "../infrastructure/workbookRepository.js";
import { importWorkbooks, WorkbookImportError } from "./importWorkbook.js";

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
