import { ToolNotFoundError } from "@openexcel/agent";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import * as runRepo from "../../sessions/runs/repository.js";
import { createSheet as createSheetUseCase } from "../application/createSheet.js";

export const createSheet = defineServerTool("createSheet", {
  persistenceMode: "mutation",
  resultBudget: { maxTokens: 1_000, compact: (value) => value },
  execute: async (input, { context, db }) => {
    const result = await createSheetUseCase(
      context.workspaceId,
      input.workbookId,
      input.name,
      input.sourceSheetId,
      db,
    );
    if (!result) {
      throw new ToolNotFoundError(`Workbook ${input.workbookId} 不存在`);
    }
    await runRepo.upsertRunSheetSnapshot(
      {
        runId: context.runId,
        sheetId: result.id,
        uploadedData: null,
        config: null,
        kind: "created",
      },
      db,
    );
    return result;
  },
});
