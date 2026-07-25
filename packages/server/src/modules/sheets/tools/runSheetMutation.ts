import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import {
  serializeSheetSnapshot,
  sheetRecordToSnapshot,
} from "../../../shared/utils/sheetSnapshot.js";
import { withWorkspaceUndoLock } from "../../sessions/infrastructure/workspaceUndoLock.js";
import * as runRepo from "../../sessions/runs/repository.js";
import { invalidateUndoCheckpointsForSheetsInTransaction } from "../../sessions/runs/undoCheckpoint.js";
import type * as sheetRepo from "../infrastructure/sheetRepository.js";

type RunToolContext = {
  runId: number;
  workspaceId: number;
  db?: Prisma.TransactionClient;
};

type SheetForWorkspace = NonNullable<Awaited<ReturnType<typeof sheetRepo.findSheetForWorkspace>>>;
type RevisionedResult = { revision: number };

export async function runSheetMutation<T extends RevisionedResult>(
  context: RunToolContext,
  sheetId: number,
  mutation: (sheet: SheetForWorkspace, tx: Prisma.TransactionClient) => Promise<T>,
) {
  const execute = async (tx: Prisma.TransactionClient) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId, workbook: { workspaceId: context.workspaceId } },
      include: { workbook: true },
    });
    if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

    const result = await mutation(sheet, tx);
    const snapshot = serializeSheetSnapshot(sheetRecordToSnapshot(sheet));

    await runRepo.recordRestorableRunSheetSnapshot(tx, {
      runId: context.runId,
      sheetId,
      uploadedData: snapshot.uploadedData,
      config: snapshot.config,
      beforeRevision: sheet.revision,
      afterRevision: result.revision,
    });
    await invalidateUndoCheckpointsForSheetsInTransaction(
      tx,
      context.workspaceId,
      [sheetId],
      context.runId,
    );

    return result;
  };

  if (context.db) return execute(context.db);
  return withWorkspaceUndoLock(context.workspaceId, () => prisma.$transaction(execute));
}
