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
  uploadedData: any[] | null;
  config: any | null;
}): FortuneSheetData {
  let celldata: FortuneCell[];
  let merges: { row: [number, number]; col: [number, number] }[];

  if (sheet.uploadedData && isCelldata(sheet.uploadedData)) {
    celldata = sheet.uploadedData as FortuneCell[];
    merges = extractMergesFromCelldata(celldata);
  } else {
    celldata = [];
    merges = [];
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
