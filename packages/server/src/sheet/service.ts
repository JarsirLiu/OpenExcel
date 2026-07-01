import { prisma } from "../db.js";
import { deserializeSheet } from "../utils/sheetSerialization.js";

export async function getSheet(sheetId: number) {
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return null;
  return deserializeSheet(sheet);
}

export async function updateSheetData(sheetId: number, celldata: any[], config?: any) {
  if (!Array.isArray(celldata)) {
    return { error: "Invalid data format" };
  }

  const data: any = { uploadedData: JSON.stringify(celldata) };
  if (config !== undefined) {
    data.config = JSON.stringify(config);
  }

  await prisma.sheet.update({
    where: { id: sheetId },
    data,
  });
  return { success: true };
}