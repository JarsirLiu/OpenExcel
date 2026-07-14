import { excelToolSpecs, runToolContextSchema } from "@openexcel/agent";
import * as runRepo from "../../sessions/runs/repository.js";
import { createWorkbook as createWorkbookUseCase } from "../application/createWorkbook.js";

export const createWorkbook = {
  ...excelToolSpecs.createWorkbook,
  contextSchema: runToolContextSchema,
  execute: async (
    input: { name?: string; sheetName?: string; sourceSheetId?: number },
    { context }: { context: { runId: number; workspaceId: number } },
  ) => {
    const result = await createWorkbookUseCase(
      context.workspaceId,
      input.name,
      input.sheetName,
      input.sourceSheetId,
    );
    await runRepo.upsertRunSheetSnapshot({
      runId: context.runId,
      sheetId: result.initialSheet.id,
      uploadedData: null,
      config: null,
    });
    return result;
  },
};
