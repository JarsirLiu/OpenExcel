import { prisma } from "../../infra/database/db.js";
import type { Prisma } from "../../infra/database/prismaTypes.js";

export async function findWorkbooks(workspaceId: number): Promise<Prisma.WorkbookGetPayload<{}>[]> {
  return prisma.workbook.findMany({
    where: { workspaceId },
    orderBy: { order: "asc" },
  });
}

export async function findWorkbooksWithSheets(workspaceId: number) {
  return prisma.workbook.findMany({
    where: { workspaceId },
    orderBy: { order: "asc" },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
}

export async function findWorkbookWithSheets(id: number, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({
    where: { id, workspaceId },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
  return workbook;
}

export async function findWorkbook(id: number, workspaceId: number) {
  return prisma.workbook.findFirst({ where: { id, workspaceId } });
}

export async function createSheet(data: {
  workbookId: number;
  sheetNo: number;
  name: string;
  order: number;
  columns: string;
  merges: string;
  uploadedData: string;
  config?: string;
}) {
  return prisma.sheet.create({
    data: {
      ...data,
      config: data.config ?? null,
    },
  });
}

export async function deleteSheetAndReindex(
  workbookId: number,
  sheetId: number,
  workspaceId: number,
) {
  return prisma.$transaction(async (tx) => {
    const workbook = await tx.workbook.findFirst({ where: { id: workbookId, workspaceId } });
    if (!workbook) return;

    await tx.sheet.delete({ where: { id: sheetId } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    for (let index = 0; index < sheets.length; index += 1) {
      const sheet = sheets[index];
      await tx.sheet.update({
        where: { id: sheet.id },
        data: { order: index, sheetNo: index + 1 },
      });
    }
  });
}

export async function updateWorkbookName(id: number, name: string, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({ where: { id, workspaceId } });
  if (!workbook) return null;
  return prisma.workbook.update({ where: { id }, data: { name } });
}

export async function deleteWorkbook(id: number, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({ where: { id, workspaceId } });
  if (!workbook) return null;
  return prisma.workbook.delete({ where: { id: workbook.id } });
}
