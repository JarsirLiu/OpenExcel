import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import {
  findSheetCells as findCells,
  parseSheetToolRange,
  type SheetCellQuery,
} from "@openexcel/core";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

export const findSheetCells = {
  ...excelToolSpecs.findSheetCells,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    { sheetId, range, query }: { sheetId: number; range?: string; query: SheetCellQuery },
    { context }: { context: { workspaceId: number } },
  ) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

    return {
      workbook: { id: sheet.workbook.id, name: sheet.workbook.name },
      sheet: { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name },
      matches: findCells(sheetRecordToSnapshot(sheet).celldata, query, {
        range: range ? parseSheetToolRange(range) : undefined,
      }),
    };
  },
};
