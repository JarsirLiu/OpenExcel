import { excelToolSpecs } from "@openexcel/agent";
import { prisma } from "../../db.js";
import { celldataToGrid, toOneBasedIndex } from "@openexcel/core";
import { parseMergesFromCelldata } from "../domain.js";
import { sheetRecordToCelldata } from "../../utils/sheetData.js";

export const readSheet = {
  ...excelToolSpecs.readSheet,
  execute: async ({ sheetId }: { sheetId: number }) => {
    const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

    const celldata: any[] = sheetRecordToCelldata(sheet);
    if (Array.isArray(celldata) && celldata.length > 0) {
      const maxCol = Math.max(...celldata.map((c: any) => c.c), 0);
      const columnCount = maxCol + 1;
      const grid = celldataToGrid(celldata, columnCount);
      const merges = parseMergesFromCelldata(celldata);

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

    return {
      sheetName: sheet.name,
      rowCount: 0,
      columnCount: 0,
      headers: [],
      data: [],
      merges: [],
    };
  },
};
