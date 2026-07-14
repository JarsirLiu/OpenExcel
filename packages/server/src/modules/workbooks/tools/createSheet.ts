import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import * as runRepo from "../../sessions/runs/repository.js";
import { createSheet as createSheetUseCase } from "../application/createSheet.js";

export const createSheet = {
  ...excelToolSpecs.createSheet,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { workbookId: number; name?: string; sourceSheetId?: number },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const result = await createSheetUseCase(
      context.workspaceId,
      input.workbookId,
      input.name,
      input.sourceSheetId,
    );
    if (!result) {
      throw new Error(`Workbook ${input.workbookId} 不存在`);
    }
    await runRepo.upsertRunSheetSnapshot({
      runId: context.runId,
      sheetId: result.id,
      uploadedData: null,
      config: null,
    });
    return result;
  },
};
