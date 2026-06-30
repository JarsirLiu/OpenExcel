import { prisma } from "../../db.js";
import * as repo from "./repository.js";
import { deserializeSheet } from "../../utils/sheetSerialization.js";

export async function getSheet(sheetId: number) {
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return null;
  return deserializeSheet(sheet);
}

export async function updateSheetData(sheetId: number, celldata: any[][]) {
  if (!Array.isArray(celldata)) {
    return { error: "Invalid data format" };
  }

  await repo.updateSheetUploadedData(sheetId, JSON.stringify(celldata));
  return { success: true };
}