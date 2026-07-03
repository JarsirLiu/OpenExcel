import * as XLSX from "xlsx";
import { celldataToExcel, excelToGrid, gridToCelldata } from "@openexcel/core";
import { prisma } from "../db.js";
import * as repo from "./repository.js";
import { deserializeSheet } from "../utils/sheetSerialization.js";
import { sheetRecordToCelldata } from "../utils/sheetData.js";

function bufferToArrayBuffer(buffer: Buffer): ArrayBuffer | SharedArrayBuffer {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export type WorkbookUploadErrorCode =
  | "INVALID_EXCEL_FILE"
  | "WORKBOOK_NOT_FOUND";

export class WorkbookUploadError extends Error {
  statusCode: number;
  code: WorkbookUploadErrorCode;
  details?: Record<string, unknown>;

  constructor(
    message: string,
    code: WorkbookUploadErrorCode,
    statusCode = 400,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "WorkbookUploadError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

function readWorkbookOrThrow(buffer: Buffer) {
  try {
    return XLSX.read(buffer, { type: "buffer", cellStyles: true, cellFormula: true, cellNF: true });
  } catch (error) {
    throw new WorkbookUploadError(
      "无法解析上传的 Excel 文件，请确认文件格式有效",
      "INVALID_EXCEL_FILE",
      400,
      { cause: error instanceof Error ? error.message : String(error) },
    );
  }
}

function getCellBounds(celldata: { r: number; c: number }[]) {
  let maxRow = -1;
  let maxCol = -1;
  for (const cell of celldata) {
    if (cell.r > maxRow) maxRow = cell.r;
    if (cell.c > maxCol) maxCol = cell.c;
  }
  return {
    rows: maxRow + 1,
    cols: maxCol + 1,
  };
}

function emptySheetParseResult() {
  return { celldata: [], merges: [], config: {} };
}

function buildUploadedSheetMap(
  sheetNames: string[],
  results: { celldata: any[]; merges: any[]; config: Record<string, any> }[],
) {
  const map = new Map<string, (typeof results)[number]>();
  for (let i = 0; i < sheetNames.length; i++) {
    if (!map.has(sheetNames[i])) {
      map.set(sheetNames[i], results[i] ?? emptySheetParseResult());
    }
  }
  return map;
}

export function resolveWorkbookImportTargets(currentSheetNames: string[], uploadedSheetNames: string[]) {
  const currentSet = new Set(currentSheetNames);
  const uploadedSet = new Set(uploadedSheetNames);
  return {
    matchedSheetNames: currentSheetNames.filter((name) => uploadedSet.has(name)),
    skippedCurrentSheetNames: currentSheetNames.filter((name) => !uploadedSet.has(name)),
    ignoredUploadedSheetNames: uploadedSheetNames.filter((name) => !currentSet.has(name)),
  };
}

export async function getWorkbooks() {
  return repo.findWorkbooks();
}

export async function getReferenceCandidates() {
  const workbooks = await repo.findWorkbooksWithSheets();
  return workbooks.map((workbook) => ({
    id: workbook.id,
    name: workbook.name,
    sheets: workbook.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
    })),
  }));
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
  const workbook = await repo.findWorkbookWithSheets(workbookId);
  if (!workbook) {
    throw new WorkbookUploadError("当前工作簿不存在", "WORKBOOK_NOT_FOUND", 404);
  }

  const sheets = workbook.sheets;
  const uploadedWorkbook = readWorkbookOrThrow(buffer);
  const uploadedSheetNames = uploadedWorkbook.SheetNames;

  const results = excelToGrid(bufferToArrayBuffer(buffer), uploadedSheetNames);
  const resultBySheetName = buildUploadedSheetMap(uploadedSheetNames, results);
  const importTargets = resolveWorkbookImportTargets(
    sheets.map((sheet) => sheet.name),
    uploadedSheetNames,
  );
  const updatedSheets: { id: number; name: string; rows: number; cols: number }[] = [];

  await prisma.$transaction(async (tx) => {
    for (const sheet of sheets) {
      const parsed = resultBySheetName.get(sheet.name);
      if (!parsed) {
        continue;
      }
      const bounds = getCellBounds(parsed.celldata);
      await tx.sheet.update({
        where: { id: sheet.id },
        data: {
          uploadedData: JSON.stringify(parsed.celldata),
          merges: JSON.stringify(parsed.merges),
          config: JSON.stringify(parsed.config ?? {}),
        },
      });
      updatedSheets.push({ id: sheet.id, name: sheet.name, rows: bounds.rows, cols: bounds.cols });
    }
  });

  return {
    workbookId,
    workbookName: workbook.name,
    updatedSheets,
    skippedCurrentSheets: importTargets.skippedCurrentSheetNames,
    ignoredUploadedSheets: importTargets.ignoredUploadedSheetNames,
  };
}

export async function uploadAsNewWorkbook(buffer: Buffer, fileName: string) {
  const wbFile = readWorkbookOrThrow(buffer);
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
