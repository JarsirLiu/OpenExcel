import { defineServerTool } from "../../../shared/tools/serverTool.js";
import * as runRepo from "../../sessions/runs/repository.js";
import { createWorkbook as createWorkbookUseCase } from "../application/createWorkbook.js";

export const createWorkbook = defineServerTool("createWorkbook", {
  persistenceMode: "mutation",
  resultBudget: { maxTokens: 2_000, compact: (value) => value },
  execute: async (input, { context, db }) => {
    const result = await createWorkbookUseCase(
      context.workspaceId,
      input.name,
      input.sheetName,
      input.sourceSheetId,
      db,
    );
    await runRepo.upsertRunSheetSnapshot(
      {
        runId: context.runId,
        sheetId: result.initialSheet.id,
        uploadedData: null,
        config: null,
        kind: "created",
      },
      db,
    );
    return result;
  },
});
