import { prisma } from "../../infra/db.js";
import type { Prisma } from "@prisma/client";
import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";

export async function findWorkbooks(): Promise<Prisma.WorkbookGetPayload<{}>[]> {
  return prisma.workbook.findMany({ orderBy: { order: "asc" } });
}

export async function findWorkbooksWithSheets() {
  return prisma.workbook.findMany({
    orderBy: { order: "asc" },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
}

export async function findWorkbookWithSheets(id: number) {
  return prisma.workbook.findUnique({
    where: { id },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
}

export async function createSheet(data: {
  workbookId: number;
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

export async function deleteSheetAndReindex(workbookId: number, sheetId: number) {
  return prisma.$transaction(async (tx) => {
    await tx.sheet.delete({ where: { id: sheetId } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    await Promise.all(
      sheets.map((sheet, index) => tx.sheet.update({ where: { id: sheet.id }, data: { order: index } })),
    );
  });
}

export async function deleteWorkbook(id: number) {
  return prisma.workbook.delete({ where: { id } });
}
