import { prisma } from "../../../infra/database/db.js";

export async function findSheetForWorkspace(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return sheet;
}

export async function findSheetsForWorkbook(workbookId: number, workspaceId: number) {
  return prisma.sheet.findMany({
    where: { workbookId, workbook: { workspaceId } },
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  });
}

export async function updateSheetName(sheetId: number, name: string, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return prisma.sheet.update({
    where: { id: sheet.id },
    data: { name },
  });
}

export async function findSheet(sheetId: number, workspaceId: number) {
  return findSheetForWorkspace(sheetId, workspaceId);
}
