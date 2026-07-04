import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";
import { prisma } from "../../infra/db.js";

export async function findSheetWithWorkbook(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: { include: { sheets: { orderBy: { order: "asc" } } } } },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return sheet;
}

export async function updateSheetData(sheetId: number, data: { uploadedData: string; config?: string }, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;

  return prisma.sheet.update({
    where: { id: sheet.id },
    data: {
      uploadedData: data.uploadedData,
      config: data.config ?? null,
    },
  });
}

export async function deleteSheet(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return prisma.sheet.delete({ where: { id: sheet.id } });
}

export async function deleteSheetAndReindex(workbookId: number, sheetId: number, workspaceId: number) {
  await prisma.$transaction(async (tx) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) return;
    if (sheet.workbook.workspaceId !== workspaceId) return;
    await tx.sheet.delete({ where: { id: sheet.id } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    await Promise.all(
      sheets.map((s, i) => tx.sheet.update({ where: { id: s.id }, data: { order: i } })),
    );
  });
}

export async function getSheet(sheetId: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
  });
  if (!sheet) return null;
  const workbook = await prisma.workbook.findFirst({ where: { id: sheet.workbookId, workspaceId } });
  if (!workbook) return null;
  return deserializeSheet(sheet);
}
