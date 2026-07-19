import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import { projectSheetObjects, type SheetObjectType } from "@openexcel/core";
import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import { listCharts } from "../../charts/application/chartService.js";
import { findSheetForWorkspace, findSheetsForWorkbook } from "../infrastructure/sheetRepository.js";

export const readSheetObjects = {
  ...excelToolSpecs.readSheetObjects,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    { sheetId, objectType }: { sheetId: number; objectType: SheetObjectType },
    { context }: { context: { workspaceId: number } },
  ) => {
    const sheet = await findSheetForWorkspace(sheetId, context.workspaceId);
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);
    const charts =
      objectType === "charts" ? await listCharts(context.workspaceId, sheet.workbookId) : [];
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
          charts,
        },
        objectType,
      ),
    };
  },
};
