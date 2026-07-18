import type { Worksheet } from "exceljs";
import type { FortuneCell, FortuneCellValue } from "../excel/celldataUtils.js";
import { applyFortuneBorderInfo } from "./excelJsBorder.js";
import { applyFortuneCell } from "./excelJsCell.js";
import { applyFortuneAutoFilter } from "./excelJsFilter.js";
import type { ExcelSheetInput } from "./xlsxExportTypes.js";

type MergeRange = {
  row: [number, number];
  col: [number, number];
};

function parseConfig(config?: Record<string, any> | string | null): Record<string, any> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      const parsed = JSON.parse(config);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return config;
}

function nestedFortuneConfig(config: Record<string, any>): Record<string, any> {
  return config.config && typeof config.config === "object" && !Array.isArray(config.config)
    ? config.config
    : {};
}

function collectMergeRanges(
  celldata: FortuneCell[],
  config?: Record<string, any> | string | null,
): MergeRange[] {
  const ranges = new Map<string, MergeRange>();
  const parsedConfig = parseConfig(config);
  const layoutConfig = nestedFortuneConfig(parsedConfig);
  for (const cell of celldata) {
    const merge = cell.v?.mc;
    if (!merge) continue;
    const row: [number, number] = [merge.r, merge.r + (merge.rs ?? 1) - 1];
    const col: [number, number] = [merge.c, merge.c + (merge.cs ?? 1) - 1];
    ranges.set(`${row[0]},${col[0]},${row[1]},${col[1]}`, { row, col });
  }

  const mergeConfig = parsedConfig.merge ?? layoutConfig.merge;
  if (mergeConfig && typeof mergeConfig === "object") {
    for (const value of Object.values(
      mergeConfig as Record<string, { r: number; c: number; rs: number; cs: number }>,
    )) {
      if (!value) continue;
      const row: [number, number] = [value.r, value.r + (value.rs ?? 1) - 1];
      const col: [number, number] = [value.c, value.c + (value.cs ?? 1) - 1];
      ranges.set(`${row[0]},${col[0]},${row[1]},${col[1]}`, { row, col });
    }
  }

  return [...ranges.values()];
}

function columnName(index: number): string {
  let value = index + 1;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}

function activeCellFromConfig(config: Record<string, any>): string {
  const selection = config.luckysheet_select_save?.[0];
  const row = selection?.row?.[0];
  const column = selection?.column?.[0];
  if (!Number.isInteger(row) || row < 0 || !Number.isInteger(column) || column < 0) return "A1";
  return `${columnName(column)}${row + 1}`;
}

function applyWorksheetView(worksheet: Worksheet, config: Record<string, any>): void {
  const zoomRatio = Number(config.zoomRatio);
  const zoomScale = Number.isFinite(zoomRatio) && zoomRatio > 0 ? Math.round(zoomRatio * 100) : 100;
  worksheet.views = [
    {
      state: "normal",
      activeCell: activeCellFromConfig(config),
      showGridLines:
        config.showGridLines !== false &&
        config.showGridLines !== 0 &&
        config.showGridLines !== "0",
      zoomScale,
      zoomScaleNormal: zoomScale,
    },
  ];
}

function applyDimensions(
  worksheet: Worksheet,
  config: Record<string, any>,
  columnWidths?: Record<string, number> | null,
  rowHeights?: Record<string, number> | null,
): void {
  const layoutConfig = nestedFortuneConfig(config);
  const columnlen = config.columnlen ?? layoutConfig.columnlen ?? columnWidths;
  if (columnlen && typeof columnlen === "object") {
    for (const [index, width] of Object.entries(columnlen)) {
      const numericIndex = Number(index);
      const numericWidth = Number(width);
      if (!Number.isInteger(numericIndex) || numericIndex < 0 || !Number.isFinite(numericWidth))
        continue;
      worksheet.getColumn(numericIndex + 1).width = Math.max(1, numericWidth / 7);
    }
  }

  const rowlen = config.rowlen ?? layoutConfig.rowlen ?? rowHeights;
  if (rowlen && typeof rowlen === "object") {
    for (const [index, height] of Object.entries(rowlen)) {
      const numericIndex = Number(index);
      const numericHeight = Number(height);
      if (!Number.isInteger(numericIndex) || numericIndex < 0 || !Number.isFinite(numericHeight))
        continue;
      worksheet.getRow(numericIndex + 1).height = numericHeight;
    }
  }
}

function writeFallbackRows(worksheet: Worksheet, rows: string[][]): void {
  rows.forEach((row, rowIndex) => {
    row.forEach((value, columnIndex) => {
      worksheet.getCell(rowIndex + 1, columnIndex + 1).value = value ?? "";
    });
  });
}

export function writeSheetToWorksheet(worksheet: Worksheet, sheet: ExcelSheetInput): void {
  const config = parseConfig(sheet.config);
  const merges = collectMergeRanges(sheet.celldata, config);

  for (const entry of sheet.celldata) {
    const value = entry.v as FortuneCellValue;
    const merge = value.mc;
    if (merge && (merge.r !== entry.r || merge.c !== entry.c)) continue;
    const cell = worksheet.getCell(entry.r + 1, entry.c + 1);
    applyFortuneCell(cell, value);
  }

  if (sheet.celldata.length === 0 && Array.isArray(sheet.fallbackRows)) {
    writeFallbackRows(worksheet, sheet.fallbackRows);
  }

  for (const merge of merges) {
    const start = `${columnName(merge.col[0])}${merge.row[0] + 1}`;
    const end = `${columnName(merge.col[1])}${merge.row[1] + 1}`;
    if (start !== end) worksheet.mergeCells(`${start}:${end}`);
  }

  const layoutConfig = nestedFortuneConfig(config);
  applyFortuneBorderInfo(worksheet, config.borderInfo ?? layoutConfig.borderInfo);

  applyDimensions(worksheet, config, sheet.columnWidths, sheet.rowHeights);
  applyFortuneAutoFilter(worksheet, config);
  applyWorksheetView(worksheet, config);
}
