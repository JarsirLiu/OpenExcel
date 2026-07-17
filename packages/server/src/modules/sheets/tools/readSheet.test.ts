import { beforeEach, describe, expect, it, vi } from "vitest";

const mockFindFirst = vi.fn();

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    sheet: {
      findFirst: mockFindFirst,
    },
  },
}));

const { readSheet } = await import("./readSheet.js");

function makeSheetRow(ri: number, prefix: string) {
  return { r: ri, c: 0, v: { v: `${prefix}-Name` } };
}

describe("readSheet", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
  });

  describe("default call (no range params)", () => {
    it("should return an overview with representative samples", async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        r: i + 1,
        c: 0,
        v: { v: `row${i + 1}` },
      }));
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "Name" } },
          { r: 0, c: 1, v: { v: "Age" } },
          ...rows,
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

      expect(result.mode).toBe("overview");
      expect(result.firstRowValues).toEqual(["Name", "Age"]);
      // 1 表头行 + 100 数据行 = 101 行；visualRowCount 不再因表头扣除第 1 行。
      expect(result.totalRowCount).toBe(101);
      expect(result.totalColumnCount).toBe(2);
      // 抽样行号基于 visualRowCount=101：四分位分别为 25/51/76，最后一行是 101。
      expect(result.sampleRows.map((sample) => sample.row)).toEqual(
        expect.arrayContaining([1, 25, 51, 76, 101]),
      );
      expect(result.sampleRows.length).toBeLessThanOrEqual(24);
      expect(result.data).toEqual([]);
      expect(result.hasMoreRows).toBe(false);
      expect(result.hasMoreRowsAbove).toBe(false);
      expect(result.hint).toContain("概览");
    });

    it("should include all rows as samples for a small sheet", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "Name" } },
          { r: 1, c: 0, v: { v: "Alice" } },
          { r: 2, c: 0, v: { v: "Bob" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

      // 3 行 celldata → visualRowCount=3，3 行全部进入抽样。
      expect(result.sampleRows.map((sample) => sample.row)).toEqual([1, 2, 3]);
      expect(result.data).toEqual([]);
      expect(result.hasMoreRows).toBe(false);
      expect(result.sampleRowCount).toBe(3);
    });
  });

  describe("with range params", () => {
    it("should return specified row range", async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        r: i + 1,
        c: 0,
        v: { v: `row${i + 1}` },
      }));
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "Name" } }, ...rows]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, startRow: 50, endRow: 60 },
        { context: { workspaceId: 1 } },
      );

      expect(result.startRow).toBe(50);
      expect(result.endRow).toBe(60);
      expect(result.data.length).toBe(11);
      expect(result.hasMoreRows).toBe(true);
      expect(result.hasMoreRowsAbove).toBe(true);
      // visualRowCount=101，剩余 101-60=41 行。
      expect(result.hint).toContain("41行未读取");
    });

    it("should filter by column range", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "A" } },
          { r: 0, c: 1, v: { v: "B" } },
          { r: 0, c: 2, v: { v: "C" } },
          { r: 1, c: 0, v: { v: "x" } },
          { r: 1, c: 1, v: { v: "y" } },
          { r: 1, c: 2, v: { v: "z" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, startCol: 2, endCol: 3 },
        { context: { workspaceId: 1 } },
      );

      expect(result.startCol).toBe(2);
      expect(result.endCol).toBe(3);
      // 表头不再被偏移：r=0 和 r=1 都被读取，共 4 个单元格。
      expect(result.data.length).toBe(4);
      expect(result.data[0]).toEqual({ row: 1, col: 2, value: "B" });
      expect(result.data[1]).toEqual({ row: 1, col: 3, value: "C" });
      expect(result.data[2]).toEqual({ row: 2, col: 2, value: "y" });
      expect(result.data[3]).toEqual({ row: 2, col: 3, value: "z" });
      expect(result.hasMoreCols).toBe(false);
    });

    it("should cap wide ranges and return a pagination hint", async () => {
      const cells = [
        ...Array.from({ length: 200 }, (_, col) => ({
          r: 0,
          c: col,
          v: { v: `Header${col + 1}` },
        })),
        ...Array.from({ length: 40 }, (_, row) =>
          Array.from({ length: 200 }, (_, col) => ({
            r: row + 1,
            c: col,
            v: { v: `${row + 1}-${col + 1}` },
          })),
        ).flat(),
      ];
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "WideSheet",
        sheetNo: 1,
        uploadedData: JSON.stringify(cells),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, startRow: 1, endRow: 40, startCol: 1, endCol: 200 },
        { context: { workspaceId: 1 } },
      );

      expect(result.endRow).toBe(20);
      expect(result.endCol).toBe(200);
      expect(result.data.length).toBe(4_000);
      expect(result.hasMoreRows).toBe(true);
      expect(result.hint).toContain("单次4000个单元格上限");
    });
  });

  describe("metadata", () => {
    it("should return first-row values and column types", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "Name" } },
          { r: 0, c: 1, v: { v: "Score" } },
          { r: 1, c: 0, v: { v: "Alice" } },
          { r: 1, c: 1, v: { v: "95" } },
          { r: 2, c: 0, v: { v: "Bob" } },
          { r: 2, c: 1, v: { v: "87" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

      expect(result.firstRowValues).toEqual(["Name", "Score"]);
      expect(result.columnTypes).toEqual(["string", "number"]);
      expect(result.columnStats).toHaveProperty("2");
      expect(result.columnStats["2"]).toEqual({
        min: 87,
        max: 95,
        avg: 91,
        count: 2,
      });
    });
  });

  describe("error handling", () => {
    it("should throw when sheet does not exist", async () => {
      mockFindFirst.mockResolvedValue(null);

      await expect(
        readSheet.execute({ sheetId: 999 }, { context: { workspaceId: 1 } }),
      ).rejects.toThrow("Sheet 999 不存在");
    });

    it("should throw when sheet belongs to different workspace", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: "[]",
        workbook: { workspaceId: 1 },
      });

      await expect(
        readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 2 } }),
      ).rejects.toThrow("Sheet 1 不存在");
    });
  });

  describe("merges", () => {
    it("should filter merges by range", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "H" } },
          { r: 1, c: 0, v: { v: "A", mc: { r: 1, c: 0, rs: 1, cs: 2 } } },
          { r: 2, c: 0, v: { v: "B", mc: { r: 2, c: 0, rs: 1, cs: 2 } } },
        ]),
        workbook: { workspaceId: 1 },
      });

      // 1-based 行号：r=1 → row 2，r=2 → row 3。读取 row 1..3 才能覆盖两个合并。
      const all = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 3 },
        { context: { workspaceId: 1 } },
      );

      expect(all.merges.length).toBe(2);
      expect(all.merges).toEqual([
        { startRow: 2, startCol: 1, endRow: 2, endCol: 2 },
        { startRow: 3, startCol: 1, endRow: 3, endCol: 2 },
      ]);

      const partial = await readSheet.execute(
        { sheetId: 1, startRow: 2, endRow: 2 },
        { context: { workspaceId: 1 } },
      );

      expect(partial.merges.length).toBe(1);
      expect(partial.merges[0]).toEqual({ startRow: 2, startCol: 1, endRow: 2, endCol: 2 });
    });
  });

  describe("empty sheet", () => {
    it("should handle empty celldata", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute({ sheetId: 1 }, { context: { workspaceId: 1 } });

      expect(result.totalRowCount).toBe(0);
      expect(result.totalColumnCount).toBe(0);
      expect(result.data).toEqual([]);
      expect(result.hasMoreRows).toBe(false);
    });
  });

  // 坐标契约边界测试（用户方案第八节）：存储 0-based ↔ 工具 1-based 必须在 readSheet 单一入口完成。
  describe("coordinate contract", () => {
    it("maps storage r=0 (A1) to tool row=1,col=1", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([{ r: 0, c: 0, v: { v: "A1-content" } }]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
        { context: { workspaceId: 1 } },
      );

      expect(result.data).toEqual([{ row: 1, col: 1, value: "A1-content" }]);
    });

    it("maps storage r=2 (A3) to tool row=3,col=1", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "A1" } },
          { r: 1, c: 0, v: { v: "A2" } },
          { r: 2, c: 0, v: { v: "A3" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 3, endRow: 3, startCol: 1, endCol: 1 },
        { context: { workspaceId: 1 } },
      );

      expect(result.data).toEqual([{ row: 3, col: 1, value: "A3" }]);
    });

    it("keeps the first row even when it is business data (no header)", async () => {
      // 用户实际场景：第一行就是业务数据，不是表头。
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "上年度开票销售收入" } },
          { r: 1, c: 0, v: { v: "本年度开票销售收入" } },
          { r: 2, c: 0, v: { v: "近6个月销售趋势" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 3, includeMetadata: true },
        { context: { workspaceId: 1 } },
      );

      expect(result.totalRowCount).toBe(3);
      expect(result.data.map((cell) => cell.row)).toEqual([1, 2, 3]);
      expect(result.data.map((cell) => cell.value)).toEqual([
        "上年度开票销售收入",
        "本年度开票销售收入",
        "近6个月销售趋势",
      ]);
    });

    it("keeps the first row even when it looks like a header", async () => {
      // 首行信息只作为原始元数据返回，不被推断为表头，也不影响坐标。
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "Name" } },
          { r: 1, c: 0, v: { v: "Alice" } },
          { r: 2, c: 0, v: { v: "Bob" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 3, includeMetadata: true },
        { context: { workspaceId: 1 } },
      );

      expect(result.firstRowValues).toEqual(["Name"]);
      expect(result.data.map((cell) => cell.row)).toEqual([1, 2, 3]);
      expect(result.data.map((cell) => cell.value)).toEqual(["Name", "Alice", "Bob"]);
    });

    it("preserves row numbers across empty middle rows", async () => {
      // 中间有空行：r=0, r=2 有数据，r=1 为空（不在 celldata 中）。
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "row1" } },
          { r: 2, c: 0, v: { v: "row3" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 3 },
        { context: { workspaceId: 1 } },
      );

      expect(result.totalRowCount).toBe(3);
      expect(result.data).toEqual([
        { row: 1, col: 1, value: "row1" },
        { row: 3, col: 1, value: "row3" },
      ]);
    });

    it("keeps row numbers continuous across paginated reads", async () => {
      const rows = Array.from({ length: 50 }, (_, i) => ({
        r: i,
        c: 0,
        v: { v: `r${i + 1}` },
      }));
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify(rows),
        workbook: { workspaceId: 1 },
      });

      const firstPage = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 10 },
        { context: { workspaceId: 1 } },
      );
      const secondPage = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 11, endRow: 20 },
        { context: { workspaceId: 1 } },
      );

      expect(firstPage.data.map((cell) => cell.row)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      expect(secondPage.data.map((cell) => cell.row)).toEqual([
        11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
      ]);
      expect(firstPage.data[0].value).toBe("r1");
      expect(secondPage.data[0].value).toBe("r11");
    });

    it("returns merge ranges in 1-based tool coordinates", async () => {
      // r=0,c=0 合并 2 行 3 列 → 工具坐标 startRow=1, endRow=2, endCol=3。
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Sheet1",
        sheetNo: 1,
        uploadedData: JSON.stringify([
          { r: 0, c: 0, v: { v: "merged", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
          { r: 2, c: 0, v: { v: "solo" } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 3 },
        { context: { workspaceId: 1 } },
      );

      expect(result.merges).toEqual([{ startRow: 1, startCol: 1, endRow: 2, endCol: 3 }]);
    });

    it("keeps an empty sheet range valid", async () => {
      mockFindFirst.mockResolvedValue({
        id: 1,
        name: "Empty",
        sheetNo: 1,
        uploadedData: JSON.stringify([]),
        workbook: { workspaceId: 1 },
      });

      const result = await readSheet.execute(
        { sheetId: 1, mode: "range" },
        { context: { workspaceId: 1 } },
      );

      expect(result.startRow).toBe(1);
      expect(result.endRow).toBe(1);
      expect(result.startCol).toBe(1);
      expect(result.endCol).toBe(1);
      expect(result.data).toEqual([]);
    });
  });
});
