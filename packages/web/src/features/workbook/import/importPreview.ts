import { celldataToGrid, excelToGrid, isCelldata, type FortuneCell } from "@openexcel/core";
import type { WorkbookFull, SheetSchema } from "../../../api/workbooks";

export type ImportSheetStatus = "matched" | "missing" | "extra";

export interface ImportCellDiff {
  row: number;
  col: number;
  kind: "added" | "removed" | "changed";
  currentValue: string;
  uploadedValue: string;
}

export interface ImportSheetPreview {
  key: string;
  name: string;
  status: ImportSheetStatus;
  currentSheet?: SheetSchema;
  uploadedSheetName?: string;
  currentCells: FortuneCell[];
  uploadedCells: FortuneCell[];
  currentRows: number;
  currentCols: number;
  uploadedRows: number;
  uploadedCols: number;
  addedCells: number;
  removedCells: number;
  changedCells: number;
  sampleDiffs: ImportCellDiff[];
}

export interface WorkbookImportPreview {
  workbookId: number;
  workbookName: string;
  fileName: string;
  currentSheetCount: number;
  uploadedSheetCount: number;
  matchedCount: number;
  missingCount: number;
  extraCount: number;
  sheets: ImportSheetPreview[];
}

interface Bounds {
  rows: number;
  cols: number;
}

function normalizeText(value: unknown): string {
  return value == null ? "" : String(value);
}

export function getCellText(cell?: FortuneCell): string {
  if (!cell) return "";
  const text = cell.v?.m ?? cell.v?.v ?? "";
  return normalizeText(text);
}

export function getCellSignature(cell?: FortuneCell): string {
  if (!cell) return "";
  return JSON.stringify({
    v: cell.v?.v ?? "",
    m: cell.v?.m ?? "",
    f: cell.v?.f ?? "",
  });
}

function getCelldataBounds(celldata: FortuneCell[]): Bounds {
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

function toCelldata(value: unknown): FortuneCell[] {
  return isCelldata(value) ? value : [];
}

function buildSheetPreview(
  currentSheet: SheetSchema | undefined,
  uploadedSheetName: string | undefined,
  uploadedResult: { celldata: FortuneCell[] } | undefined,
): ImportSheetPreview {
  const currentCells = toCelldata(currentSheet?.uploadedData);
  const uploadedCells = uploadedResult?.celldata ?? [];
  const currentBounds = getCelldataBounds(currentCells);
  const uploadedBounds = getCelldataBounds(uploadedCells);
  const currentCols = Math.max(currentSheet?.columns.length ?? 0, currentBounds.cols, 1);
  const currentRows = Math.max(currentBounds.rows, 1);
  const uploadedCols = Math.max(uploadedBounds.cols, 1);
  const uploadedRows = Math.max(uploadedBounds.rows, 1);
  const maxRows = Math.max(currentRows, uploadedRows);
  const maxCols = Math.max(currentCols, uploadedCols);
  const currentMap = new Map<string, FortuneCell>();
  const uploadedMap = new Map<string, FortuneCell>();

  for (const cell of currentCells) {
    currentMap.set(`${cell.r},${cell.c}`, cell);
  }
  for (const cell of uploadedCells) {
    uploadedMap.set(`${cell.r},${cell.c}`, cell);
  }

  const sampleDiffs: ImportCellDiff[] = [];
  let addedCells = 0;
  let removedCells = 0;
  let changedCells = 0;

  for (let row = 0; row < maxRows; row++) {
    for (let col = 0; col < maxCols; col++) {
      const key = `${row},${col}`;
      const currentCell = currentMap.get(key);
      const uploadedCell = uploadedMap.get(key);
      const currentValue = getCellText(currentCell);
      const uploadedValue = getCellText(uploadedCell);
      const currentSignature = getCellSignature(currentCell);
      const uploadedSignature = getCellSignature(uploadedCell);
      if (currentSignature === uploadedSignature) continue;

      if (!currentCell && uploadedCell) {
        addedCells += 1;
        if (sampleDiffs.length < 50) {
          sampleDiffs.push({ row, col, kind: "added", currentValue, uploadedValue });
        }
        continue;
      }

      if (currentCell && !uploadedCell) {
        removedCells += 1;
        if (sampleDiffs.length < 50) {
          sampleDiffs.push({ row, col, kind: "removed", currentValue, uploadedValue });
        }
        continue;
      }

      changedCells += 1;
      if (sampleDiffs.length < 50) {
        sampleDiffs.push({ row, col, kind: "changed", currentValue, uploadedValue });
      }
    }
  }

  return {
    key: currentSheet?.id ? `sheet-${currentSheet.id}` : `uploaded-${uploadedSheetName ?? "extra"}`,
    name: currentSheet?.name ?? uploadedSheetName ?? "未命名 Sheet",
    status: currentSheet && uploadedSheetName ? "matched" : currentSheet ? "missing" : "extra",
    currentSheet,
    uploadedSheetName,
    currentCells,
    uploadedCells,
    currentRows,
    currentCols,
    uploadedRows,
    uploadedCols,
    addedCells,
    removedCells,
    changedCells,
    sampleDiffs,
  };
}

export async function buildWorkbookImportPreview(workbook: WorkbookFull, file: File): Promise<WorkbookImportPreview> {
  const buffer = await file.arrayBuffer();
  const XLSX = await import("xlsx");
  const sheetWorkbook = XLSX.read(buffer, { type: "array" });
  const uploadedSheetNames = sheetWorkbook.SheetNames;
  const parsedSheets = excelToGrid(buffer, uploadedSheetNames);
  const uploadedMap = new Map<string, { celldata: FortuneCell[] }>();

  uploadedSheetNames.forEach((name, index) => {
    uploadedMap.set(name, {
      celldata: parsedSheets[index]?.celldata ?? [],
    });
  });

  const currentNameSet = new Set(workbook.sheets.map((sheet) => sheet.name));
  const matchedPreviews = workbook.sheets.map((sheet) =>
    buildSheetPreview(sheet, uploadedMap.has(sheet.name) ? sheet.name : undefined, uploadedMap.get(sheet.name)),
  );

  const extraPreviews = uploadedSheetNames
    .filter((name) => !currentNameSet.has(name))
    .map((name) => buildSheetPreview(undefined, name, uploadedMap.get(name)));

  const sheets = [...matchedPreviews, ...extraPreviews];
  const matchedCount = matchedPreviews.filter((sheet) => sheet.uploadedSheetName != null).length;
  const missingCount = matchedPreviews.length - matchedCount;
  const extraCount = extraPreviews.length;

  return {
    workbookId: workbook.id,
    workbookName: workbook.name,
    fileName: file.name,
    currentSheetCount: workbook.sheets.length,
    uploadedSheetCount: uploadedSheetNames.length,
    matchedCount,
    missingCount,
    extraCount,
    sheets,
  };
}

export function makeDisplayGrid(celldata: FortuneCell[], columnCount: number, rowCount: number): string[][] {
  const grid = celldataToGrid(celldata, Math.max(columnCount, 1));
  const normalizedRows = Math.max(rowCount, 1);
  while (grid.length < normalizedRows) {
    grid.push(Array(Math.max(columnCount, 1)).fill(""));
  }
  for (const row of grid) {
    while (row.length < Math.max(columnCount, 1)) {
      row.push("");
    }
  }
  return grid;
}
