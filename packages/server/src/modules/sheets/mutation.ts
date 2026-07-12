import * as repo from "./repository.js";

export async function updateSheetName(workspaceId: number, sheetId: number, name: string) {
  if (!name || typeof name !== "string" || name.trim().length === 0) {
    return { error: "Name is required" };
  }
  const updated = await repo.updateSheetName(sheetId, name.trim(), workspaceId);
  if (!updated) {
    return { error: "Sheet not found" };
  }
  return { success: true, id: updated.id, name: updated.name };
}
