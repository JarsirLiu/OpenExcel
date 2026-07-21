import { withUndoTrackedSheetMutationAfterSuccess } from "../../sessions/runs/undoCheckpoint.js";
import * as repo from "../infrastructure/sheetRepository.js";

export async function updateSheetData(
  workspaceId: number,
  sheetId: number,
  celldata: any[],
  baseRevision: number,
  config?: any,
) {
  if (!Array.isArray(celldata)) {
    return { error: "Invalid data format" };
  }

  const data: { uploadedData: string; config?: string } = {
    uploadedData: JSON.stringify(celldata),
  };
  if (config !== undefined) {
    data.config = JSON.stringify(config);
  }

  const updated = await withUndoTrackedSheetMutationAfterSuccess(workspaceId, [sheetId], () =>
    repo.updateSheetData(sheetId, data, baseRevision, workspaceId),
  );
  if (!updated) {
    return { error: "Sheet not found" };
  }
  return { success: true, revision: updated.revision };
}
