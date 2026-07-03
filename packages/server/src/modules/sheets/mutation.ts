import * as repo from "./repository.js";

export async function updateSheetData(sheetId: number, celldata: any[], config?: any) {
  if (!Array.isArray(celldata)) {
    return { error: "Invalid data format" };
  }

  const data: { uploadedData: string; config?: string } = {
    uploadedData: JSON.stringify(celldata),
  };
  if (config !== undefined) {
    data.config = JSON.stringify(config);
  }

  await repo.updateSheetData(sheetId, data);
  return { success: true };
}
