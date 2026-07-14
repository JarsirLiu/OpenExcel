import { excelToolSpecs, workspaceToolContextSchema } from "@openexcel/agent";
import { createWorkbook as createWorkbookUseCase } from "../application/createWorkbook.js";

export const createWorkbook = {
  ...excelToolSpecs.createWorkbook,
  contextSchema: workspaceToolContextSchema,
  execute: async (
    input: { name?: string; sheetName?: string; sourceSheetId?: number },
    { context }: { context: { workspaceId: number } },
  ) => {
    return createWorkbookUseCase(
      context.workspaceId,
      input.name,
      input.sheetName,
      input.sourceSheetId,
    );
  },
};
