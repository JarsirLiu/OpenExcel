import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import { prisma } from "../../../infra/database/db.js";
import { celldataToGrid } from "@openexcel/core";
import { parseMergesFromCelldata } from "../domain.js";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";

export const readSheet = {
  ...excelToolSpecs.readSheet,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    { sheetId }: { sheetId: number },
    { context }: { context: { workspaceId: number } },
  ) => {
    const sheet = await prisma.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    if (sheet.workbook.workspaceId !== context.workspaceId) {
      throw new Error(`Sheet ${sheetId} 不存在`);
    }

    const celldata: any[] = sheetRecordToCelldata(sheet);
    if (Array.isArray(celldata) && celldata.length > 0) {
      const maxCol = Math.max(...celldata.map((c: any) => c.c), 0);
      const columnCount = maxCol + 1;
      const grid = celldataToGrid(celldata, columnCount);
      const merges = parseMergesFromCelldata(celldata);
      const sheetInfo = {
        sheetNo: sheet.sheetNo,
        sheetName: sheet.name,
      };

      const firstRow = grid[0] ?? [];
      const secondRow = grid[1] ?? [];
      const isFirstRowHeader = firstRow.some((v: string) => v.length > 0)
        && secondRow.some((v: string) => v.length > 0);

      return {
        sheetInfo,
        sheetName: sheet.name,
        sheetNo: sheet.sheetNo,
        rowCount: grid.length,
        columnCount,
        headers: isFirstRowHeader ? firstRow : [],
        data: isFirstRowHeader ? grid.slice(1) : grid,
        merges,
      };
    }

    const sheetInfo = {
      sheetNo: sheet.sheetNo,
      sheetName: sheet.name,
    };

    return {
      sheetInfo,
      sheetName: sheet.name,
      sheetNo: sheet.sheetNo,
      rowCount: 0,
      columnCount: 0,
      headers: [],
      data: [],
      merges: [],
    };
  },
};
