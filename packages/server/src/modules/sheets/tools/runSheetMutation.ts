import * as runRepo from "../../sessions/runs/repository.js";
import { withUndoTrackedSheetMutationAfterSuccess } from "../../sessions/runs/undoCheckpoint.js";
import { SheetRevisionConflictError } from "../domain/errors.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";

type RunToolContext = {
  runId: number;
  workspaceId: number;
};

type SheetForWorkspace = NonNullable<Awaited<ReturnType<typeof sheetRepo.findSheetForWorkspace>>>;

export async function runSheetMutation<T>(
  context: RunToolContext,
  sheetId: number,
  mutation: (sheet: SheetForWorkspace) => Promise<T>,
) {
  return withUndoTrackedSheetMutationAfterSuccess(
    context.workspaceId,
    [sheetId],
    async () => {
      const sheet = await sheetRepo.findSheetForWorkspace(sheetId, context.workspaceId);
      if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

      const existingSnapshot = await runRepo.findRunSheetSnapshot(context.runId, sheetId);
      await runRepo.upsertRunSheetSnapshot({
        runId: context.runId,
        sheetId,
        uploadedData: sheet.uploadedData ?? null,
        config: sheet.config ?? null,
      });

      try {
        return await mutation(sheet);
      } catch (error) {
        if (!existingSnapshot && error instanceof SheetRevisionConflictError) {
          await runRepo.deleteRunSheetSnapshot(context.runId, sheetId);
        }
        throw error;
      }
    },
    context.runId,
  );
}
