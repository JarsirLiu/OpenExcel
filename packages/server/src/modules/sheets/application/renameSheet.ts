import { withUndoTrackedSheetMutation } from "../../sessions/runs/undoCheckpoint.js";
import * as repo from "../infrastructure/sheetRepository.js";

export async function renameSheet(workspaceId: number, sheetId: number, name: string) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { error: "Name is required" };
  }
  const updated = await withUndoTrackedSheetMutation(workspaceId, [sheetId], () =>
    repo.updateSheetName(sheetId, name.trim(), workspaceId),
  );
  if (!updated) {
    return { error: "Sheet not found" };
  }
  return { success: true, id: updated.id, name: updated.name };
}
