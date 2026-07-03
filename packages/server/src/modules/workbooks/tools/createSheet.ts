import { excelToolSpecs } from "@openexcel/agent";
import * as service from "../service.js";

export const createSheet = {
  ...excelToolSpecs.createSheet,
  execute: async (
    input: { workbookId: number; name?: string; sourceSheetId?: number },
  ) => {
    const result = await service.createSheet(input.workbookId, input.name, input.sourceSheetId);
    if (!result) {
      throw new Error(`Workbook ${input.workbookId} 不存在`);
    }
    return result;
  },
};
