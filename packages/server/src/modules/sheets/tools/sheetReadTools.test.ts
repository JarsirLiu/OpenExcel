import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();
const mockFindMany = vi.fn();
const mockListCharts = vi.fn();

vi.mock("../../../infra/database/db.js", () => ({
  prisma: { sheet: { findFirst: mockFindFirst, findMany: mockFindMany } },
}));
vi.mock("../../charts/application/chartService.js", () => ({
  listCharts: mockListCharts,
}));

const { readSheetData } = await import("./readSheetData.js");
const { findSheetCells } = await import("./findSheetCells.js");
const { readSheetObjects } = await import("./readSheetObjects.js");

function context(workspaceId = 1) {
  return { context: { workspaceId } };
}

describe("sheet read tools", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindMany.mockReset();
    mockListCharts.mockReset();
    mockListCharts.mockResolvedValue([]);
    mockFindMany.mockResolvedValue([{ id: 1, name: "Sheet1" }]);
  });

  it("returns a compact matrix with formulas and merge metadata", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "名称", mc: { r: 0, c: 0, rs: 1, cs: 2 } } },
        { r: 1, c: 0, v: { v: "可乐" } },
        { r: 1, c: 1, v: { v: 0, f: "=A2*10" } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute({ sheetId: 1 }, context());

    expect(result.workbook).toEqual({ id: 3, name: "Workbook" });
    expect(result.sheet).toEqual({ id: 1, sheetNo: 1, name: "Sheet1" });
    expect(result.range).toBe("A1:B2");
    expect(result.values).toEqual([
      ["名称", null],
      ["可乐", 0],
    ]);
    expect(result.formulaExceptions).toEqual([{ cell: "B2", formula: "=A2*10" }]);
    expect(result.merges).toEqual([{ range: "A1:B1", anchor: "A1", rowSpan: 1, colSpan: 2 }]);
  });

  it("continues a wide read from the structured cursor", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify(
        Array.from({ length: 6 }, (_, row) =>
          Array.from({ length: 6 }, (_, col) => ({
            r: row,
            c: col,
            v: { v: `${row + 1},${col + 1}` },
          })),
        ).flat(),
      ),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute(
      {
        sheetId: 1,
        continuation: { requestedRange: "A1:F6", nextRow: 1, nextCol: 5 },
      },
      context(),
    );

    expect(result.range).toBe("E1:F6");
    expect(result.values).toEqual([
      ["1,5", "1,6"],
      ["2,5", "2,6"],
      ["3,5", "3,6"],
      ["4,5", "4,6"],
      ["5,5", "5,6"],
      ["6,5", "6,6"],
    ]);
    expect(result.continuation).toBeNull();
  });

  it("uses the same workspace boundary for data and format queries", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "绿色", bg: "#92D050" } }]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await findSheetCells.execute(
      { sheetId: 1, query: { style: { fill: "#92D050" } } },
      context(),
    );

    expect(result.matches).toEqual([{ range: "A1", count: 1, reason: "fill=#92D050" }]);
  });

  it("finds empty cells inside the requested range without matching zero", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "商品" } },
        { r: 1, c: 0, v: { v: "可乐" } },
        { r: 1, c: 1, v: { v: 0 } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await findSheetCells.execute(
      { sheetId: 1, range: "A1:B2", query: { valueType: "empty" } },
      context(),
    );

    expect(result.matches).toEqual([{ range: "B1", count: 1, reason: "type=empty" }]);
  });

  it("applies the requested range to ordinary cell queries", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "目标" } },
        { r: 0, c: 1, v: { v: "目标" } },
        { r: 1, c: 0, v: { v: "目标" } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await findSheetCells.execute(
      { sheetId: 1, range: "A1:A2", query: { value: "目标" } },
      context(),
    );

    expect(result.matches).toEqual([{ range: "A1:A2", count: 2, reason: "value=目标" }]);
  });

  it("reads one object category per call", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: "[]",
      config: JSON.stringify({ filter_select: { row: [0, 2], column: [0, 1] } }),
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetObjects.execute({ sheetId: 1, objectType: "filters" }, context());

    expect(mockListCharts).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      objectType: "filters",
      objects: [{ kind: "filter", range: "A1:B3" }],
    });
  });

  it("reports unmodeled object categories instead of returning an empty list", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: "[]",
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    await expect(
      readSheetObjects.execute({ sheetId: 1, objectType: "pivotTables" }, context()),
    ).rejects.toThrow("pivotTables is not modeled");
  });

  it("rejects missing sheets", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(readSheetData.execute({ sheetId: 99 }, context())).rejects.toThrow(
      "Sheet 99 不存在",
    );
  });
});
