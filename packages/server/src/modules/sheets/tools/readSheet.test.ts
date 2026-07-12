import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSheetInfo = vi.fn();
const mockReadToolRange = vi.fn();

vi.mock("../../documents/service.js", () => ({
  getSheetInfo: mockGetSheetInfo,
}));

vi.mock("../../documents/toolAdapter.js", () => ({
  readToolRange: mockReadToolRange,
  isMergeObject: (object: { type: string; data: Record<string, unknown> }) =>
    object.type === "custom" && object.data.kind === "merge",
}));

const { readSheet } = await import("./readSheet.js");

function makeSheetInfo(maxRow = 100, maxColumn = 2) {
  return {
    sheetId: 1,
    sheetNo: 1,
    name: "Sheet1",
    format: "openexcel-document-v1",
    version: 1,
    revision: 3,
    maxRow,
    maxColumn,
  };
}

function makeCells(
  cells: Array<{ row: number; col: number; value: string | number | boolean | null }>,
) {
  return cells.map((cell) => ({
    row: cell.row,
    col: cell.col,
    value: { value: cell.value, displayValue: cell.value == null ? "" : String(cell.value) },
  }));
}

describe("readSheet", () => {
  beforeEach(() => {
    mockGetSheetInfo.mockReset();
    mockReadToolRange.mockReset();
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo());
    mockReadToolRange.mockImplementation(async (_workspaceId, _sheetId, range) => ({
      sheetId: 1,
      format: "openexcel-document-v1",
      version: 1,
      revision: 3,
      maxRow: 100,
      maxColumn: 2,
      range,
      cells: [],
      objects: [],
    }));
  });

  it("reads the default page from the canonical range", async () => {
    mockReadToolRange.mockResolvedValue({
      sheetId: 1,
      format: "openexcel-document-v1",
      version: 1,
      revision: 3,
      maxRow: 100,
      maxColumn: 2,
      range: { startRow: 0, startCol: 0, endRow: 30, endCol: 1 },
      cells: makeCells([
        { row: 0, col: 0, value: "Name" },
        { row: 0, col: 1, value: "Age" },
        ...Array.from({ length: 30 }, (_, index) => ({
          row: index + 1,
          col: 0,
          value: `row${index + 1}`,
        })),
      ]),
      objects: [],
    });

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.headers).toEqual(["Name", "Age"]);
    expect(result.totalRowCount).toBe(100);
    expect(result.totalColumnCount).toBe(2);
    expect(result.startRow).toBe(1);
    expect(result.endRow).toBe(30);
    expect(result.data).toHaveLength(30);
    expect(result.hasMoreRows).toBe(true);
    expect(result.hint).toContain("70行未读取");
  });

  it("reads an explicit row and column viewport", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(100, 3));
    mockReadToolRange.mockResolvedValue({
      sheetId: 1,
      format: "openexcel-document-v1",
      version: 1,
      revision: 3,
      maxRow: 100,
      maxColumn: 3,
      range: { startRow: 50, startCol: 1, endRow: 60, endCol: 2 },
      cells: makeCells([
        { row: 50, col: 1, value: "y" },
        { row: 50, col: 2, value: "z" },
      ]),
      objects: [],
    });

    const result = await readSheet.execute(
      { sheetId: 1, startRow: 50, endRow: 60, startCol: 2, endCol: 3 },
      { context: { workspaceId: 1 } },
    );

    expect(result.startRow).toBe(50);
    expect(result.endRow).toBe(60);
    expect(result.startCol).toBe(2);
    expect(result.endCol).toBe(3);
    expect(result.data).toEqual([
      { row: 50, col: 2, value: "y" },
      { row: 50, col: 3, value: "z" },
    ]);
    expect(result.hasMoreRows).toBe(true);
    expect(result.hasMoreRowsAbove).toBe(true);
  });

  it("infers numeric columns from canonical values", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(3, 2));
    mockReadToolRange.mockResolvedValue({
      sheetId: 1,
      format: "openexcel-document-v1",
      version: 1,
      revision: 3,
      maxRow: 3,
      maxColumn: 2,
      range: { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
      cells: makeCells([
        { row: 0, col: 0, value: "Name" },
        { row: 0, col: 1, value: "Score" },
        { row: 1, col: 0, value: "Alice" },
        { row: 1, col: 1, value: 95 },
        { row: 2, col: 0, value: "Bob" },
        { row: 2, col: 1, value: 87 },
      ]),
      objects: [],
    });

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.hasFirstRowAsHeader).toBe(true);
    expect(result.headers).toEqual(["Name", "Score"]);
    expect(result.columnTypes).toEqual(["string", "number"]);
    expect(result.columnStats["2"]).toEqual({ min: 87, max: 95, avg: 91, count: 2 });
  });

  it("throws when the canonical sheet is not found", async () => {
    mockGetSheetInfo.mockResolvedValue(null);

    await expect(
      readSheet.execute({ sheetId: 999 }, { context: { workspaceId: 1 } }),
    ).rejects.toThrow("Sheet 999 不存在");
  });

  it("handles an empty canonical sheet", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(0, 0));

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.totalRowCount).toBe(0);
    expect(result.totalColumnCount).toBe(0);
    expect(result.data).toEqual([]);
    expect(result.hasMoreRows).toBe(false);
  });
});
