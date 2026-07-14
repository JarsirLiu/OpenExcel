import * as runRepo from "../../sessions/runs/repository.js";
import { withUndoTrackedSheetMutation } from "../../sessions/runs/undoCheckpoint.js";
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
  return withUndoTrackedSheetMutation(
    context.workspaceId,
    [sheetId],
    async () => {
      const sheet = await sheetRepo.findSheetForWorkspace(sheetId, context.workspaceId);
      if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

      await runRepo.upsertRunSheetSnapshot({
        runId: context.runId,
        sheetId,
        uploadedData: sheet.uploadedData ?? null,
        config: sheet.config ?? null,
      });

      return mutation(sheet);
    },
    context.runId,
  );
}
