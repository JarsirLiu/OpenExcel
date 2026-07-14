import { withUndoTrackedSheetMutation } from "../../sessions/runs/undoCheckpoint.js";
import * as repo from "../infrastructure/workbookRepository.js";

export async function deleteWorkbook(workspaceId: number, id: number) {
  const workbooks = await repo.findWorkbooks(workspaceId);
  if (workbooks.length <= 1) {
    return { error: "Workspace must keep at least one workbook", statusCode: 409 as const };
  }

  const wb = await repo.findWorkbookWithSheets(id, workspaceId);
  if (!wb) return { error: "Workbook not found" };

  await withUndoTrackedSheetMutation(
    workspaceId,
    wb.sheets.map((sheet) => sheet.id),
    () => repo.deleteWorkbook(id, workspaceId),
  );
  return { success: true };
}
