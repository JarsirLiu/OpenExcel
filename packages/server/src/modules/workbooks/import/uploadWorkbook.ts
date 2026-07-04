import * as XLSX from "xlsx";
import { prisma } from "../../../infra/db.js";
import * as repo from "../repository.js";

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

export async function uploadExcel(workspaceId: number, workbookId: number, buffer: Buffer) {
  const workbook = await repo.findWorkbookWithSheets(workbookId, workspaceId);
  if (!workbook) {
    throw new WorkbookUploadError("当前工作簿不存在", "WORKBOOK_NOT_FOUND", 404);
  }

  const sheets = workbook.sheets;
  const uploadedWorkbook = readWorkbookOrThrow(buffer);
  const uploadedSheetNames = uploadedWorkbook.SheetNames;

  const { excelToGrid } = await import("@openexcel/core");
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

export async function uploadAsNewWorkbook(workspaceId: number, buffer: Buffer, fileName: string) {
  const wbFile = readWorkbookOrThrow(buffer);
  const sheetNames = wbFile.SheetNames;
  const { excelToGrid } = await import("@openexcel/core");
  const results = excelToGrid(bufferToArrayBuffer(buffer), sheetNames);
  const wbName = fileName.replace(/\.[^.]+$/, "");

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    const wb = await tx.workbook.create({
      data: { workspaceId, name: wbName, order: nextOrder },
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
