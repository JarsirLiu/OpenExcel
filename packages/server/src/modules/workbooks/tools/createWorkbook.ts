import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import * as service from "../service.js";

export const createWorkbook = {
  ...excelToolSpecs.createWorkbook,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    input: { name?: string; sheetName?: string; sourceSheetId?: number },
    { context }: { context: { workspaceId: number } },
  ) => {
    return service.createWorkbook(
      context.workspaceId,
      input.name,
      input.sheetName,
      input.sourceSheetId,
    );
  },
};
