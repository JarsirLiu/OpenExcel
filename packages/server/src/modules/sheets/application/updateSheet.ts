import * as repo from "../infrastructure/sheetRepository.js";

export async function updateSheetData(
  workspaceId: number,
  sheetId: number,
  celldata: any[],
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

  const updated = await repo.updateSheetData(sheetId, data, workspaceId);
  if (!updated) {
    return { error: "Sheet not found" };
  }
  return { success: true };
}
