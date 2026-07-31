import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

function canonicalizeSheetFixture(value: Record<string, unknown>) {
  if (!value) return value;
  if (typeof value.uploadedData !== "string") return value;
  return {
    ...value,
    chunks: [{ payload: JSON.stringify({ celldata: JSON.parse(value.uploadedData) }) }],
  };
}

const originalMockResolvedValue = mockFindFirst.mockResolvedValue.bind(mockFindFirst);
mockFindFirst.mockResolvedValue = ((value: Record<string, unknown>) =>
  originalMockResolvedValue(
    canonicalizeSheetFixture(value),
  )) as typeof mockFindFirst.mockResolvedValue;

vi.mock("../../../infra/database/db.js", () => ({
  prisma: { sheet: { findFirst: mockFindFirst } },
}));

const { readSheetData } = await import("./readSheetData.js");
const { readSheetObjects } = await import("./readSheetObjects.js");

function context(workspaceId = 1) {
  return { context: { workspaceId } };
}

function expectMode<T extends { mode: string }, M extends T["mode"]>(
  result: T,
  mode: M,
): asserts result is Extract<T, { mode: M }> {
  expect(result.mode).toBe(mode);
}

describe("sheet read tools", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  it("returns a compact table with formulas and merge metadata", async () => {
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

    const result = await readSheetData.execute(
      { sheetId: 1, operation: "range", range: "A1:B2", format: "compact" },
      context(),
    );

    expectMode(result, "compact");
    expect(result.workbook).toEqual({ id: 3, name: "Workbook" });
    expect(result.sheet).toEqual({ id: 1, sheetNo: 1, name: "Sheet1" });
    expect(result.range).toBe("A1:B2");
    expect(result.columns).toEqual(["A", "B"]);
    expect(result.rows).toEqual([
      { row: 1, values: ["名称"] },
      { row: 2, values: ["可乐", 0] },
    ]);
    expect(result.annotations).toContainEqual({ cell: "B2", formula: "=A2*10" });
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
        operation: "range",
        format: "exact",
        continuation: { requestedRange: "A1:F6", nextRow: 1, nextCol: 5 },
      },
      context(),
    );

    expectMode(result, "exact");
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

  it("consumes a multi-page range without duplicating or skipping rows", async () => {
    const cells = Array.from({ length: 4_001 }, (_, row) => ({
      r: row,
      c: 0,
      v: { v: row + 1 },
    }));
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify(cells),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const pages: number[] = [];
    let continuation: { requestedRange: string; nextRow: number; nextCol: number } | undefined;
    for (;;) {
      const result = await readSheetData.execute(
        {
          sheetId: 1,
          operation: "range",
          format: "exact",
          ...(continuation ? { continuation } : { range: "A1:A4001" }),
        },
        context(),
      );
      expectMode(result, "exact");
      pages.push(...result.values.map(([value]) => value as number));
      if (!result.continuation) break;
      continuation = result.continuation;
    }

    expect(pages).toEqual(Array.from({ length: 4_001 }, (_, row) => row + 1));
  });

  it("rejects a range mixed with a continuation cursor", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "值" } }]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    await expect(
      readSheetData.execute(
        {
          sheetId: 1,
          operation: "range",
          range: "A1:B2",
          format: "exact",
          continuation: { requestedRange: "A1:B2", nextRow: 1, nextCol: 2 },
        },
        context(),
      ),
    ).rejects.toThrow("range and continuation cannot be provided together");
  });

  it("returns date values separately from Excel serials", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: 44805, m: "2022/9/1", ct: { t: "d", fa: "m/d/yy" } } },
        { r: 0, c: 1, v: { v: 10, m: "10", ct: { t: "n" } } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute(
      { sheetId: 1, operation: "range", format: "exact" },
      context(),
    );

    expectMode(result, "exact");
    expect(result.values).toEqual([[44805, 10]]);
    expect(result.dateValues).toEqual({ A1: "2022-09-01" });
  });

  it("finds cells through the unified read tool", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "绿色", bg: "#92D050" } }]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute(
      { sheetId: 1, operation: "find", query: { style: { fill: "#92D050" } } },
      context(),
    );

    expectMode(result, "find");
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

    const result = await readSheetData.execute(
      { sheetId: 1, operation: "find", range: "A1:B2", query: { valueType: "empty" } },
      context(),
    );

    expectMode(result, "find");
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
        { r: 0, c: 2, v: { v: "目标" } },
        { r: 1, c: 0, v: { v: "目标" } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute(
      { sheetId: 1, operation: "find", range: "A1:A2", query: { value: "目标" } },
      context(),
    );

    expectMode(result, "find");
    expect(result.matches).toEqual([{ range: "A1:A2", count: 2, reason: "value=目标" }]);
  });

  it("paginates cell matches without changing the search semantics", async () => {
    mockFindFirst.mockResolvedValue({
      id: 1,
      name: "Sheet1",
      sheetNo: 1,
      workbookId: 3,
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "目标" } },
        { r: 0, c: 2, v: { v: "目标" } },
      ]),
      config: null,
      workbook: { workspaceId: 1, id: 3, name: "Workbook" },
    });

    const result = await readSheetData.execute(
      {
        sheetId: 1,
        operation: "find",
        range: "A1:C1",
        query: { value: "目标" },
        limit: 1,
      },
      context(),
    );

    expectMode(result, "find");
    expect(result.matches).toHaveLength(1);
    expect(result.nextOffset).toBe(1);
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

    expect(result).toMatchObject({
      objectType: "filters",
      objects: [{ kind: "filter", range: "A1:B3" }],
    });
  });

  it("rejects missing sheets", async () => {
    mockFindFirst.mockResolvedValue(null);

    await expect(
      readSheetData.execute({ sheetId: 99, operation: "overview" }, context()),
    ).rejects.toThrow("Sheet 99 不存在");
  });
});
