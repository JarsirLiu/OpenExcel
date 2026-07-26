import { findSheetCells as findCells, parseSheetToolRange } from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

export const findSheetCells = defineServerTool("findSheetCells", {
  execute: async ({ sheetId, range, query }, { context }) => {
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
});
