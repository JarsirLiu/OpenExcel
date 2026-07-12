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
      expect(result.headers).toEqual(["Name", "Age"]);
      expect(result.totalRowCount).toBe(100);
      expect(result.totalColumnCount).toBe(2);
      expect(result.sampleRows.map((sample) => sample.row)).toEqual(
        expect.arrayContaining([1, 25, 50, 75, 100]),
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

      expect(result.sampleRows.map((sample) => sample.row)).toEqual([1, 2]);
      expect(result.data).toEqual([]);
      expect(result.hasMoreRows).toBe(false);
      expect(result.sampleRowCount).toBe(2);
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
      expect(result.hint).toContain("40行未读取");
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
      expect(result.data.length).toBe(2);
      expect(result.data[0]).toEqual({ row: 1, col: 2, value: "y" });
      expect(result.data[1]).toEqual({ row: 1, col: 3, value: "z" });
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
    it("should detect header and return column types", async () => {
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

      expect(result.hasFirstRowAsHeader).toBe(true);
      expect(result.headers).toEqual(["Name", "Score"]);
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
          { r: 1, c: 0, v: { v: "A", mc: { rs: 1, cs: 2 } } },
          { r: 2, c: 0, v: { v: "B", mc: { rs: 1, cs: 2 } } },
        ]),
        workbook: { workspaceId: 1 },
      });

      const all = await readSheet.execute(
        { sheetId: 1, mode: "range", startRow: 1, endRow: 2 },
        { context: { workspaceId: 1 } },
      );

      expect(all.merges.length).toBe(2);

      const partial = await readSheet.execute(
        { sheetId: 1, startRow: 2, endRow: 2 },
        { context: { workspaceId: 1 } },
      );

      expect(partial.merges.length).toBe(1);
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
});
