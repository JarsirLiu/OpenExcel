import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetSheetInfo = vi.fn();
const mockReadToolRange = vi.fn();

vi.mock("../../documents/service.js", () => ({
  getSheetInfo: mockGetSheetInfo,
}));

vi.mock("../../documents/toolMutationBridge.js", () => ({
  readToolRange: mockReadToolRange,
}));

vi.mock("../../documents/toolDocumentOperations.js", () => ({
  isMergeObject: (object: { type: string; data: Record<string, unknown> }) =>
    object.type === "custom" && object.data.kind === "merge",
}));

const { readSheet } = await import("./readSheet.js");

function makeSheetInfo(maxRow = 101, maxColumn = 2) {
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
    value: {
      value: cell.value,
      displayValue: cell.value == null ? "" : String(cell.value),
    },
  }));
}

function makeRangeResult(
  range: { startRow: number; endRow: number; startCol: number; endCol: number },
  cells: ReturnType<typeof makeCells> = [],
  objects: Array<Record<string, unknown>> = [],
) {
  return {
    sheetId: 1,
    format: "openexcel-document-v1",
    version: 1,
    revision: 3,
    maxRow: 101,
    maxColumn: 2,
    range,
    cells,
    objects,
    styles: {},
  };
}

describe("readSheet", () => {
  beforeEach(() => {
    mockGetSheetInfo.mockReset();
    mockReadToolRange.mockReset();
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo());
    mockReadToolRange.mockImplementation(async (_workspaceId, _sheetId, range) =>
      makeRangeResult(range),
    );
  });

  it("returns a bounded overview with representative samples", async () => {
    const cells = [
      { row: 0, col: 0, value: "Name" },
      { row: 0, col: 1, value: "Score" },
      ...Array.from({ length: 100 }, (_, index) => ({
        row: index + 1,
        col: 0,
        value: `row${index + 1}`,
      })),
      ...Array.from({ length: 100 }, (_, index) => ({
        row: index + 1,
        col: 1,
        value: index + 1,
      })),
    ];
    mockReadToolRange.mockResolvedValue(
      makeRangeResult({ startRow: 0, endRow: 100, startCol: 0, endCol: 1 }, makeCells(cells)),
    );

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.mode).toBe("overview");
    expect(result.headers).toEqual(["Name", "Score"]);
    expect(result.totalRowCount).toBe(100);
    expect(result.totalColumnCount).toBe(2);
    expect(result.sampleRows.map((sample) => sample.row)).toEqual(
      expect.arrayContaining([1, 25, 50, 75, 100]),
    );
    expect(result.data).toEqual([]);
    expect(result.sampleRows.length).toBeLessThanOrEqual(24);
    expect(result.hint).toContain("概览");
  });

  it("returns all rows as samples for a small sheet", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(3, 1));
    mockReadToolRange.mockResolvedValue(
      makeRangeResult(
        { startRow: 0, endRow: 2, startCol: 0, endCol: 0 },
        makeCells([
          { row: 0, col: 0, value: "Name" },
          { row: 1, col: 0, value: "Alice" },
          { row: 2, col: 0, value: "Bob" },
        ]),
      ),
    );

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.sampleRows.map((sample) => sample.row)).toEqual([1, 2]);
    expect(result.data).toEqual([]);
    expect(result.sampleRowCount).toBe(2);
  });

  it("reads an explicit canonical range", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(101, 3));
    mockReadToolRange.mockResolvedValue(
      makeRangeResult(
        { startRow: 50, startCol: 1, endRow: 60, endCol: 2 },
        makeCells([
          { row: 50, col: 1, value: "y" },
          { row: 50, col: 2, value: "z" },
        ]),
      ),
    );

    const result = await readSheet.execute(
      { sheetId: 1, startRow: 50, endRow: 60, startCol: 2, endCol: 3 },
      { context: { workspaceId: 1 } },
    );

    if (result.mode !== "range") throw new Error("Expected a range result");
    expect(result.startRow).toBe(50);
    expect(result.endRow).toBe(60);
    expect(result.data).toEqual([
      { row: 50, col: 2, value: "y" },
      { row: 50, col: 3, value: "z" },
    ]);
    expect(result.hasMoreRows).toBe(true);
    expect(result.hasMoreRowsAbove).toBe(true);
  });

  it("caps explicit ranges at 4000 cells", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(41, 200));
    const cells = [
      ...Array.from({ length: 200 }, (_, col) => ({
        row: 0,
        col,
        value: `Header${col + 1}`,
      })),
      ...Array.from({ length: 20 }, (_, row) =>
        Array.from({ length: 200 }, (_, col) => ({
          row: row + 1,
          col,
          value: `${row + 1}-${col + 1}`,
        })),
      ).flat(),
    ];
    mockReadToolRange.mockResolvedValue(
      makeRangeResult({ startRow: 0, startCol: 0, endRow: 20, endCol: 199 }, makeCells(cells)),
    );

    const result = await readSheet.execute(
      { sheetId: 1, startRow: 1, endRow: 40, startCol: 1, endCol: 200 },
      { context: { workspaceId: 1 } },
    );

    if (result.mode !== "range") throw new Error("Expected a range result");
    expect(result.endRow).toBe(20);
    expect(result.endCol).toBe(200);
    expect(result.data).toHaveLength(4_000);
    expect(result.hasMoreRows).toBe(true);
    expect(result.hint).toContain("单次4000个单元格上限");
  });

  it("infers numeric columns from canonical values", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(3, 2));
    mockReadToolRange.mockResolvedValue(
      makeRangeResult(
        { startRow: 0, endRow: 2, startCol: 0, endCol: 1 },
        makeCells([
          { row: 0, col: 0, value: "Name" },
          { row: 0, col: 1, value: "Score" },
          { row: 1, col: 0, value: "Alice" },
          { row: 1, col: 1, value: 95 },
          { row: 2, col: 0, value: "Bob" },
          { row: 2, col: 1, value: 87 },
        ]),
      ),
    );

    const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

    expect(result.hasFirstRowAsHeader).toBe(true);
    expect(result.headers).toEqual(["Name", "Score"]);
    expect(result.columnTypes).toEqual(["string", "number"]);
    expect(result.columnStats["2"]).toEqual({ min: 87, max: 95, avg: 91, count: 2 });
  });

  it("filters merge objects to the requested range", async () => {
    mockGetSheetInfo.mockResolvedValue(makeSheetInfo(3, 2));
    mockReadToolRange.mockResolvedValue(
      makeRangeResult(
        { startRow: 0, startCol: 0, endRow: 2, endCol: 1 },
        makeCells([{ row: 0, col: 0, value: "Header" }]),
        [
          {
            type: "custom",
            position: { startRow: 1, startCol: 0, endRow: 1, endCol: 1 },
            data: { kind: "merge" },
          },
        ],
      ),
    );

    const result = await readSheet.execute(
      { sheetId: 1, mode: "range", startRow: 1, endRow: 1 },
      { context: { workspaceId: 1 } },
    );

    expect(result.merges).toEqual([{ startRow: 1, startCol: 1, endRow: 1, endCol: 2 }]);
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
    expect(result.sampleRows).toEqual([]);
  });
});
