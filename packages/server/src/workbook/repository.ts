import { prisma } from "../db.js";
import type { Prisma } from "@prisma/client";
import { deserializeSheet } from "../utils/sheetSerialization.js";
import type { SheetJson } from "../utils/sheetSerialization.js";

export async function findWorkbooks(): Promise<Prisma.WorkbookGetPayload<{}>[]> {
  return prisma.workbook.findMany({ orderBy: { order: "asc" } });
}

export async function findWorkbookWithSheets(id: number) {
  return prisma.workbook.findUnique({
    where: { id },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
}

export async function findSheetsByWorkbook(workbookId: number) {
  return prisma.sheet.findMany({
    where: { workbookId },
    orderBy: { order: "asc" },
  });
}

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

export async function createSheet(data: {
  workbookId: number;
  name: string;
  order: number;
  columns: string;
  merges: string;
  rows: string;
}) {
  return prisma.sheet.create({ data });
}

export async function deleteSheet(id: number) {
  return prisma.sheet.delete({ where: { id } });
}

export async function deleteWorkbook(id: number) {
  return prisma.workbook.delete({ where: { id } });
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

export function toSheetJson(sheet: Prisma.SheetGetPayload<{}>): SheetJson {
  return deserializeSheet(sheet);
}