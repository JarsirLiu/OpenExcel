import { prisma } from "../db.js";
import { deserializeSheet } from "../utils/sheetSerialization.js";
import * as repo from "../workbook/repository.js";

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

export async function deleteSheet(sheetId: number) {
  const sheet = await repo.findSheetWithWorkbook(sheetId);
  if (!sheet) return { error: "Sheet not found" };
  if (sheet.workbook.sheets.length <= 1) {
    return { error: "Workbook must keep at least one sheet" };
  }

  await prisma.$transaction(async (tx) => {
    await tx.sheet.delete({ where: { id: sheetId } });
    await repo.reindexSheetOrder(sheet.workbookId);
  });

  return { success: true, workbookId: sheet.workbookId };
}
