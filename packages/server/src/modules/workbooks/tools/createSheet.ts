import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { runToolContextSchema } from "../../../shared/tools/context.js";
import { sheetCreatedOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import * as runRepo from "../../sessions/runs/repository.js";
import { createSheet as createSheetUseCase } from "../application/createSheet.js";

export const createSheet = defineServerTool("createSheet", {
  contextSchema: runToolContextSchema,
  outputSchema: sheetCreatedOutputSchema,
  execute: async (input, { context }) => {
    const db = (context as { db?: Prisma.TransactionClient }).db;
    const result = await createSheetUseCase(
      context.workspaceId,
      input.workbookId,
      input.name,
      input.sourceSheetId,
      db,
    );
    if (!result) {
      throw new Error(`Workbook ${input.workbookId} 不存在`);
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
