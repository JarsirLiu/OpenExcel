import { ToolNotFoundError } from "@openexcel/agent";
import { projectSheetObjects } from "@openexcel/core";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import { findSheetForWorkspace } from "../infrastructure/sheetRepository.js";

export const readSheetObjects = defineServerTool("readSheetObjects", {
  persistenceMode: "read",
  resultBudget: { maxTokens: 8_000, compact: (value) => value },
  execute: async ({ sheetId, objectType }, { context }) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new ToolNotFoundError(`Sheet ${sheetId} 不存在`);
    const parsed = deserializeSheet(sheet);

    return {
      workbook: { id: sheet.workbook.id, name: sheet.workbook.name },
      sheet: { id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name },
      objectType,
      objects: projectSheetObjects(
        {
          config: parsed.config,
        },
        objectType,
      ),
    };
  },
});
