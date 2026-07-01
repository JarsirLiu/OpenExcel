import { prisma } from "../../db.js";
import { celldataToGrid } from "@openexcel/core";
import { z } from "zod";

function extractPreview(celldata: any[], sheetName: string, sheetId: number, minRow: number, maxRow: number) {
  const maxCol = Math.max(...celldata.map((c: any) => c.c), 0);
  const columnCount = maxCol + 1;
  const grid = celldataToGrid(celldata, columnCount);
  const rows = grid.slice(minRow, maxRow + 1);

  const merges: { startRow: number; startCol: number; endRow: number; endCol: number }[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (mc) {
      const r = cell.r;
      const c = cell.c;
      if (r >= minRow && r <= maxRow) {
        merges.push({
          startRow: r - minRow,
          startCol: c,
          endRow: r + (mc.rs ?? 1) - 1 - minRow,
          endCol: c + (mc.cs ?? 1) - 1,
        });
      }
    }
  }

  return {
    sheetId,
    sheetName,
    range: { startRow: minRow, endRow: maxRow, startCol: 0, endCol: columnCount - 1 },
    rows,
    merges,
  };
}

export const writeCells = {
  description: "批量写入单元格数据。cells 数组中的每项指定 row(行号,从0开始)、col(列号,从0开始) 和 value(写入的值,纯文本)。可用于修改、新增单元格。",
  inputSchema: z.object({
    sheetId: z.coerce.number().describe("Sheet ID"),
    cells: z.array(z.object({
      row: z.coerce.number().describe("行号，从 0 开始"),
      col: z.coerce.number().describe("列号，从 0 开始"),
      value: z.string().describe("写入的值"),
    })).describe("要写入的单元格列表"),
  }),
  execute: async ({ sheetId, cells }: { sheetId: number; cells: { row: number; col: number; value: string }[] }) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return { error: `Sheet ${sheetId} 不存在` };

    const celldata: any[] = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : [];
    if (!Array.isArray(celldata)) return { error: "celldata 格式错误" };

    const cellMap = new Map<string, any>();
    for (const cell of celldata) {
      cellMap.set(`${cell.r},${cell.c}`, cell);
    }

    for (const { row, col, value } of cells) {
      const key = `${row},${col}`;
      if (cellMap.has(key)) {
        const existing = cellMap.get(key);
        existing.v = { ...existing.v, v: value, m: String(value) };
      } else {
        const newCell = { r: row, c: col, v: { v: value, m: String(value) } };
        celldata.push(newCell);
        cellMap.set(key, newCell);
      }
    }

    await prisma.sheet.update({
      where: { id: sheetId },
      data: { uploadedData: JSON.stringify(celldata) },
    });

    const minRow = Math.min(...cells.map((c) => c.row));
    const maxRow = Math.max(...cells.map((c) => c.row));

    return {
      success: true,
      updatedCells: cells.length,
      preview: extractPreview(celldata, sheet.name, sheetId, minRow, maxRow),
    };
  },
};
