import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { runToolContextSchema } from "../../../shared/tools/context.js";
import { workbookCreatedOutputSchema } from "../../../shared/tools/outputSchemas.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import * as runRepo from "../../sessions/runs/repository.js";
import { createWorkbook as createWorkbookUseCase } from "../application/createWorkbook.js";

export const createWorkbook = defineServerTool("createWorkbook", {
  contextSchema: runToolContextSchema,
  outputSchema: workbookCreatedOutputSchema,
  execute: async (input, { context }) => {
    const db = (context as { db?: Prisma.TransactionClient }).db;
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
