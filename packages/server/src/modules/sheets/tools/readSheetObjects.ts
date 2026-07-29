import { ToolNotFoundError } from "@openexcel/agent";
import { projectSheetObjects } from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import { listChartsPage } from "../../charts/application/chartService.js";
import { findSheetForWorkspace, findSheetsForWorkbook } from "../infrastructure/sheetRepository.js";

export const readSheetObjects = defineServerTool("readSheetObjects", {
  persistenceMode: "read",
  resultBudget: { maxTokens: 8_000, compact: (value) => value },
  execute: async ({ sheetId, objectType, offset = 0, limit = 50 }, { context }) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new ToolNotFoundError(`Sheet ${sheetId} 不存在`);
    const chartPage =
      objectType === "charts"
        ? await listChartsPage(context.workspaceId, sheet.workbookId, { sheetId, offset, limit })
        : { charts: [], nextOffset: null };
    const workbookSheets =
      objectType === "charts"
        ? await findSheetsForWorkbook(sheet.workbookId, context.workspaceId)
        : [];
    const parsed = deserializeSheet(sheet);

    return {
      workbook: { id: sheet.workbook.id, name: sheet.workbook.name },
      sheet: { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name },
      objectType,
      objects: projectSheetObjects(
        {
          sheetId: String(sheet.id),
          sheetName: sheet.name,
          sheetNames: new Map(workbookSheets.map((item) => [String(item.id), item.name])),
          config: parsed.config,
          charts: chartPage.charts,
        },
        objectType,
      ),
      nextOffset: chartPage.nextOffset,
    };
  },
});
