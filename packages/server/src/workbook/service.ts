import * as XLSX from "xlsx";
import { templateToExcel, excelToGrid } from "@openexcel/core";
import { prisma } from "../db.js";
import * as repo from "./repository.js";
import { deserializeSheet, cloneSheetSchema } from "../utils/sheetSerialization.js";

export async function getWorkbooks() {
  return repo.findWorkbooks();
}

export async function getWorkbook(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return null;
  return {
    id: wb.id,
    name: wb.name,
    sheets: wb.sheets.map((s) => deserializeSheet(s)),
  };
}

export async function uploadExcel(workbookId: number, buffer: Buffer) {
  const wbFile = XLSX.read(buffer, { type: "buffer" });
  const sheets = await repo.findSheetsByWorkbook(workbookId);
  const grid = excelToGrid(wbFile, sheets.map((s) => s.name));

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < sheets.length; i++) {
      const sheetData = grid[i] ?? [];
      await tx.sheet.update({
        where: { id: sheets[i].id },
        data: { uploadedData: JSON.stringify(sheetData) },
      });
    }
  });

  return sheets.length;
}

export async function exportTemplate(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return null;

  const sheets = wb.sheets.map((s) => ({
    name: s.name,
    columns: JSON.parse(s.columns),
    rows: JSON.parse(s.rows),
    merges: JSON.parse(s.merges),
  }));

  const ab = templateToExcel({ id: "export", name: wb.name, groups: [], sheets });
  return Buffer.from(ab);
}

export async function createSheet(workbookId: number, name?: string, sourceSheetId?: number) {
  const workbook = await repo.findWorkbookWithSheets(workbookId);
  if (!workbook) return null;

  const sourceSheet = sourceSheetId
    ? workbook.sheets.find((sheet) => sheet.id === sourceSheetId)
    : workbook.sheets[workbook.sheets.length - 1];

  const nextOrder = workbook.sheets.length;
  const nextName = name?.trim() || `Sheet${nextOrder + 1}`;
  const schema = sourceSheet
    ? cloneSheetSchema(sourceSheet)
    : {
        columns: JSON.stringify([{ label: "A" }]),
        merges: JSON.stringify([]),
        rows: JSON.stringify([[]]),
      };

  const sheet = await repo.createSheet({
    workbookId,
    name: nextName,
    order: nextOrder,
    columns: schema.columns,
    merges: schema.merges,
    rows: schema.rows,
  });

  return { id: sheet.id, name: sheet.name, order: sheet.order };
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