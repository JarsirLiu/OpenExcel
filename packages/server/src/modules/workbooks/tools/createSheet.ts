import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import * as service from "../service.js";

export const createSheet = {
  ...excelToolSpecs.createSheet,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    input: { workbookId: number; name?: string; sourceSheetId?: number },
    { context }: { context: { workspaceId: number } },
  ) => {
    const result = await service.createSheet(
      context.workspaceId,
      input.workbookId,
      input.name,
      input.sourceSheetId,
    );
    if (!result) {
      throw new Error(`Workbook ${input.workbookId} 不存在`);
    }
    return result;
  },
};
