import { withUndoTrackedSheetMutation } from "../../sessions/runs/undoCheckpoint.js";
import * as repo from "../infrastructure/workbookRepository.js";

export async function deleteWorkbook(workspaceId: number, id: number) {
  const wb = await repo.findWorkbookMetadata(id, workspaceId);
  if (!wb) return { error: "Workbook not found", statusCode: 404 as const };

  await withUndoTrackedSheetMutation(
    workspaceId,
    wb.sheets.map((sheet) => sheet.id),
    () => repo.deleteWorkbook(id, workspaceId),
  );
  return { success: true };
}
