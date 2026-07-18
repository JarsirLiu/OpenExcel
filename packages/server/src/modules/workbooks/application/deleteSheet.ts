import { findChartsReferencingSheet } from "../../charts/application/index.js";
import { withUndoTrackedMutation } from "../../sessions/runs/undoCheckpoint.js";
import { SheetDeletionBlockedError } from "../domain/deletion.js";
import * as repo from "../infrastructure/workbookRepository.js";

export async function deleteSheet(workspaceId: number, workbookId: number, sheetId: number) {
  const workbook = await repo.findWorkbookWithSheets(workbookId, workspaceId);
  if (!workbook) return null;

  const sheet = workbook.sheets.find((item) => item.id === sheetId);
  if (!sheet) {
    return { error: "Sheet not found", statusCode: 404 as const };
  }

  if (workbook.sheets.length <= 1) {
    return { error: "Workbook must keep at least one sheet", statusCode: 409 as const };
  }

  try {
    await withUndoTrackedMutation(
      workspaceId,
      async () => {
        const chartIds = await findChartsReferencingSheet(workspaceId, workbookId, sheetId);
        if (chartIds.length > 0) throw new SheetDeletionBlockedError(chartIds);
        return [sheetId];
      },
      () => repo.deleteSheetAndReindex(workbookId, sheetId, workspaceId),
    );
  } catch (error) {
    if (error instanceof SheetDeletionBlockedError) {
      return { error: error.message, statusCode: 409 as const };
    }
    throw error;
  }

  return {
    success: true as const,
    workbookId,
    sheetId,
    sheetNo: sheet.sheetNo,
    order: sheet.order,
  };
}
