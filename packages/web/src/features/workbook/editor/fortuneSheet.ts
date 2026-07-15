import type { FortuneCell, FortuneSheetData, SheetConfig } from "@openexcel/core";
import {
  extractMergesFromCelldata,
  isCelldata,
  normalizeFortuneCellData,
  restoreSheetConfig,
} from "@openexcel/core";

export type { FortuneCell, FortuneSheetData, SheetConfig };

export function toFortuneSheetData(sheet: {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  uploadedData: any[] | null;
  config: any | null;
}): FortuneSheetData {
  let celldata: FortuneCell[];
  let merges: { row: [number, number]; col: [number, number] }[];

  if (sheet.uploadedData && isCelldata(sheet.uploadedData)) {
    celldata = sheet.uploadedData as FortuneCell[];
    merges = extractMergesFromCelldata(celldata);
    if (merges.length === 0) {
      merges = (sheet.merges || []).map((m) => ({
        row: [m.row[0], m.row[1]],
        col: [m.col[0], m.col[1]],
      }));
    }
    if (sheet.columns.length > 0 && celldata.length > 0) {
      const headerCells = sheet.columns.map((col, ci) => ({
        r: 0,
        c: ci,
        v: { v: col.label, m: col.label },
      }));
      celldata = [...headerCells, ...celldata.map((c) => ({ ...c, r: c.r + 1 }))];
      merges = merges.map((m) => ({
        row: [m.row[0] + 1, m.row[1] + 1],
        col: [m.col[0], m.col[1]],
      }));
    }
  } else {
    celldata = [];
    merges = (sheet.merges || []).map((m) => ({
      row: [m.row[0], m.row[1]],
      col: [m.col[0], m.col[1]],
    }));
  }

  celldata = normalizeFortuneCellData(celldata);

  const result: FortuneSheetData = {
    id: String(sheet.id),
    name: sheet.name,
    celldata,
    columnWidths: sheet.columns.reduce((acc: Record<string, number>, col, i) => {
      if (col.width) acc[i] = col.width;
      return acc;
    }, {}),
    merges,
  };

  if (sheet.config && typeof sheet.config === "object") {
    restoreSheetConfig(result, sheet.config as SheetConfig);
  }

  return result;
}
