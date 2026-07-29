import { ToolNotFoundError } from "@openexcel/agent";
import { findSheetCells as findCells, parseSheetToolRange } from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

export const findSheetCells = defineServerTool("findSheetCells", {
  resultBudget: { maxTokens: 4_000, compact: (value) => value },
  execute: async ({ sheetId, range, query, offset = 0, limit = 50 }, { context }) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new ToolNotFoundError(`Sheet ${sheetId} 不存在`);

    const matches = findCells(sheetRecordToSnapshot(sheet).celldata, query, {
      range: range ? parseSheetToolRange(range) : undefined,
    });
    const page = matches.slice(offset, offset + limit);

    return {
      workbook: { id: sheet.workbook.id, name: sheet.workbook.name },
      sheet: { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name },
      matches: page,
      nextOffset: offset + page.length < matches.length ? offset + page.length : null,
    };
  },
});
