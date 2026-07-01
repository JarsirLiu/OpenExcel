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
  const wbFile = XLSX.read(buffer, { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  const sheets = await repo.findSheetsByWorkbook(workbookId);
  const results = excelToGrid(wbFile, sheets.map((s) => s.name));

  await prisma.$transaction(async (tx) => {
    for (let i = 0; i < sheets.length; i++) {
      const parsed = results[i] ?? { celldata: [], merges: [], config: {} };
      await tx.sheet.update({
        where: { id: sheets[i].id },
        data: {
          uploadedData: JSON.stringify(parsed.celldata),
          merges: JSON.stringify(parsed.merges),
          config: JSON.stringify(parsed.config ?? {}),
        },
      });
    }
  });

  return sheets.length;
}

export async function uploadAsNewWorkbook(buffer: Buffer, fileName: string) {
  const wbFile = XLSX.read(buffer, { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  const sheetNames = wbFile.SheetNames;
  const results = excelToGrid(wbFile, sheetNames);
  const wbName = fileName.replace(/\.[^.]+$/, "");

  return prisma.$transaction(async (tx) => {
    // 新工作簿放在末尾
    const maxOrder = await tx.workbook.aggregate({ _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    const wb = await tx.workbook.create({
      data: { name: wbName, order: nextOrder },
    });

    for (let i = 0; i < sheetNames.length; i++) {
      const parsed = results[i] ?? { celldata: [], merges: [], config: {} };
      await tx.sheet.create({
        data: {
          workbookId: wb.id,
          name: sheetNames[i],
          order: i,
          columns: JSON.stringify([]),
          merges: JSON.stringify(parsed.merges),
          rows: JSON.stringify([]),
          uploadedData: JSON.stringify(parsed.celldata),
          config: JSON.stringify(parsed.config ?? {}),
        },
      });
    }

    return { id: wb.id, name: wbName, sheets: sheetNames.length };
  });
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

export async function deleteWorkbook(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return { error: "Workbook not found" };

  await repo.deleteWorkbook(id);
  return { success: true };
}