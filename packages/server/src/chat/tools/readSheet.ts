import { prisma } from "../../db.js";
import { celldataToGrid } from "@openexcel/core";
import { z } from "zod";

function parseMerges(celldata: any[]): { startRow: number; startCol: number; endRow: number; endCol: number }[] {
  const merges: { startRow: number; startCol: number; endRow: number; endCol: number }[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (mc) {
      const r = cell.r;
      const c = cell.c;
      merges.push({
        startRow: r,
        startCol: c,
        endRow: r + (mc.rs ?? 1) - 1,
        endCol: c + (mc.cs ?? 1) - 1,
      });
    }
  }
  return merges;
}

function parseStoredJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export const readSheet = {
  description: "读取指定 Sheet 的全部数据，返回结构化表格信息，包含标题行、行/列数、数据二维数组、以及合并单元格信息。",
  inputSchema: z.object({
    sheetId: z.coerce.number().describe("Sheet ID"),
  }),
  execute: async ({ sheetId }: { sheetId: number }) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return { error: `Sheet ${sheetId} 不存在` };

    const celldata: any[] = parseStoredJson(sheet.uploadedData, []);
    if (Array.isArray(celldata) && celldata.length > 0) {
      const maxRow = Math.max(...celldata.map((c: any) => c.r), 0);
      const maxCol = Math.max(...celldata.map((c: any) => c.c), 0);
      const columnCount = maxCol + 1;
      const grid = celldataToGrid(celldata, columnCount);
      const merges = parseMerges(celldata);

      const firstRow = grid[0] ?? [];
      const secondRow = grid[1] ?? [];
      const isFirstRowHeader = firstRow.some((v: string) => v.length > 0)
        && secondRow.some((v: string) => v.length > 0);

      return {
        sheetName: sheet.name,
        rowCount: grid.length,
        columnCount,
        headers: isFirstRowHeader ? firstRow : [],
        data: isFirstRowHeader ? grid.slice(1) : grid,
        merges,
      };
    }

    const columns = parseStoredJson<{ label: string; width?: number }[]>(sheet.columns, []);
    const rows = parseStoredJson<string[][]>(sheet.rows, []);
    const merges = parseStoredJson<{ row: [number, number]; col: [number, number] }[]>(sheet.merges, []).map((m) => ({
      startRow: m.row[0],
      startCol: m.col[0],
      endRow: m.row[1],
      endCol: m.col[1],
    }));
    const columnCount = Math.max(columns.length, ...rows.map((row) => row.length), 0);

    return {
      sheetName: sheet.name,
      rowCount: rows.length,
      columnCount,
      headers: columns.map((c) => c.label),
      data: rows,
      merges,
    };
  },
};
