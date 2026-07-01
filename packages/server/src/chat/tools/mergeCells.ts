import { prisma } from "../../db.js";
import { celldataToGrid } from "@openexcel/core";
import { z } from "zod";

function toColRef(c: number): string {
  let ref = "";
  let n = c;
  while (n >= 0) {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  }
  return ref;
}

function toCellRef(r: number, c: number): string {
  return `${toColRef(c)}${r + 1}`;
}

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

export const mergeCells = {
  description: "合并指定范围的单元格。合并后只有左上角单元格保留值，其余格子的值会被清除。",
  inputSchema: z.object({
    sheetId: z.coerce.number().describe("Sheet ID"),
    startRow: z.coerce.number().describe("起始行号，从 0 开始"),
    startCol: z.coerce.number().describe("起始列号，从 0 开始"),
    endRow: z.coerce.number().describe("结束行号，从 0 开始"),
    endCol: z.coerce.number().describe("结束列号，从 0 开始"),
  }),
  execute: async ({ sheetId, startRow, startCol, endRow, endCol }: { sheetId: number; startRow: number; startCol: number; endRow: number; endCol: number }) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) return { error: `Sheet ${sheetId} 不存在` };

    const celldata: any[] = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : [];
    if (!Array.isArray(celldata)) return { error: "celldata 格式错误" };

    const rs = endRow - startRow + 1;
    const cs = endCol - startCol + 1;
    const cellRef = toCellRef(startRow, startCol);

    const cellMap = new Map<string, any>();
    for (const cell of celldata) {
      cellMap.set(`${cell.r},${cell.c}`, cell);
    }

    const topLeftKey = `${startRow},${startCol}`;
    const topLeft = cellMap.get(topLeftKey);
    if (topLeft) {
      topLeft.v = { ...topLeft.v, mc: { r: startRow, c: startCol, rs, cs } };
    } else {
      const newCell = { r: startRow, c: startCol, v: { v: "", m: "", mc: { r: startRow, c: startCol, rs, cs } } };
      celldata.push(newCell);
      cellMap.set(topLeftKey, newCell);
    }

    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r === startRow && c === startCol) continue;
        const key = `${r},${c}`;
        if (cellMap.has(key)) {
          const cell = cellMap.get(key);
          cell.v = { ...cell.v, mc: { r: startRow, c: startCol, rs, cs } };
        }
      }
    }

    const config = sheet.config ? JSON.parse(sheet.config) : {};
    config.merge = { ...(config.merge ?? {}), [cellRef]: { r: startRow, c: startCol, rs, cs } };

    await prisma.sheet.update({
      where: { id: sheetId },
      data: {
        uploadedData: JSON.stringify(celldata),
        config: JSON.stringify(config),
      },
    });

    return {
      success: true,
      mergedRange: `${toCellRef(startRow, startCol)}:${toCellRef(endRow, endCol)}`,
      preview: extractPreview(celldata, sheet.name, sheetId, startRow, endRow),
    };
  },
};
