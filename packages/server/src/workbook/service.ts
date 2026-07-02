import * as XLSX from "xlsx";
import { celldataToExcel, excelToGrid, gridToCelldata } from "@openexcel/core";
import { prisma } from "../db.js";
import * as repo from "./repository.js";
import { deserializeSheet } from "../utils/sheetSerialization.js";
import { sheetRecordToCelldata } from "../utils/sheetData.js";

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer | SharedArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

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
  const sheets = await repo.findSheetsByWorkbook(workbookId);
  const results = excelToGrid(bufferToArrayBuffer(buffer), sheets.map((s) => s.name));

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
  const results = excelToGrid(bufferToArrayBuffer(buffer), sheetNames);
  const wbName = fileName.replace(/\.[^.]+$/, "");

  return prisma.$transaction(async (tx) => {
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

  const sheets = wb.sheets.map((s) => {
    const parsed = deserializeSheet(s);
    const celldata = sheetRecordToCelldata(s);
    const fallbackRows = celldata.length > 0
      ? undefined
      : [parsed.columns.map((column) => column.label)];
    const columnWidths = parsed.columns.reduce((acc: Record<string, number>, column, index) => {
      if (column.width != null) acc[index] = column.width;
      return acc;
    }, {});

    return {
      name: s.name,
      celldata,
      config: parsed.config,
      columnWidths,
      fallbackRows,
    };
  });

  const ab = celldataToExcel(sheets);
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
  const sourceColumns = sourceSheet ? JSON.parse(sourceSheet.columns) as { label: string; width?: number }[] : [{ label: "A" }];
  const sourceMerges = sourceSheet ? JSON.parse(sourceSheet.merges) as { row: [number, number]; col: [number, number] }[] : [];
  const schema = {
    columns: JSON.stringify(sourceColumns),
    merges: JSON.stringify(sourceMerges),
  };
  const celldata = sourceSheet
    ? sheetRecordToCelldata(sourceSheet)
    : gridToCelldata([[]], ["A"]);

  const sheet = await repo.createSheet({
    workbookId,
    name: nextName,
    order: nextOrder,
    columns: schema.columns,
    merges: schema.merges,
    uploadedData: JSON.stringify(celldata),
  });

  return { id: sheet.id, name: sheet.name, order: sheet.order };
}

export async function deleteWorkbook(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return { error: "Workbook not found" };

  await repo.deleteWorkbook(id);
  return { success: true };
}
