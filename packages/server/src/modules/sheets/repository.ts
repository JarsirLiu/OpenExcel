import { prisma } from "../../db.js";
import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";

export async function findSheetWithWorkbook(id: number) {
  return prisma.sheet.findUnique({
    where: { id },
    include: { workbook: { include: { sheets: { orderBy: { order: "asc" } } } } },
  });
}

export async function updateSheetUploadedData(sheetId: number, uploadedData: string) {
  return prisma.sheet.update({
    where: { id: sheetId },
    data: { uploadedData },
  });
}

export async function updateSheetData(sheetId: number, data: { uploadedData: string; config?: string }) {
  return prisma.sheet.update({
    where: { id: sheetId },
    data: {
      uploadedData: data.uploadedData,
      config: data.config ?? null,
    },
  });
}

export async function deleteSheet(id: number) {
  return prisma.sheet.delete({ where: { id } });
}

export async function reindexSheetOrder(workbookId: number) {
  const sheets = await prisma.sheet.findMany({
    where: { workbookId },
    orderBy: { order: "asc" },
  });
  await Promise.all(
    sheets.map((s, i) => prisma.sheet.update({ where: { id: s.id }, data: { order: i } })),
  );
}

export async function deleteSheetAndReindex(workbookId: number, sheetId: number) {
  await prisma.$transaction(async (tx) => {
    await tx.sheet.delete({ where: { id: sheetId } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    await Promise.all(
      sheets.map((s, i) => tx.sheet.update({ where: { id: s.id }, data: { order: i } })),
    );
  });
}

export async function getSheet(sheetId: number) {
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId } });
  if (!sheet) return null;
  return deserializeSheet(sheet);
}
