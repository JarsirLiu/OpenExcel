import { excelToolSpecs } from "@openexcel/agent";
import * as service from "../service.js";

export const createWorkbook = {
  ...excelToolSpecs.createWorkbook,
  execute: async (
    input: { name?: string; sheetName?: string; sourceSheetId?: number },
  ) => {
    return service.createWorkbook(input.name, input.sheetName, input.sourceSheetId);
  },
};
