import { gridToCelldata, isCelldata, restoreSheetConfig } from "@openexcel/core";
import type { FortuneCell, SheetConfig, FortuneSheetData } from "@openexcel/core";

export type { FortuneCell, SheetConfig, FortuneSheetData };

/**
 * 从 celldata 的 mc 属性提取合并范围。
 */
function extractMergesFromCelldata(celldata: FortuneCell[]): { row: [number, number]; col: [number, number] }[] {
  const seen = new Set<string>();
  const merges: { row: [number, number]; col: [number, number] }[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (!mc) continue;
    const key = `${mc.r}_${mc.c}_${mc.rs}_${mc.cs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merges.push({
      row: [mc.r, mc.r + (mc.rs ?? 1) - 1] as [number, number],
      col: [mc.c, mc.c + (mc.cs ?? 1) - 1] as [number, number],
    });
  }
  return merges;
}

export function toFortuneSheetData(
  sheet: {
    id: number;
    name: string;
    columns: { label: string; width?: number }[];
    merges: { row: [number, number]; col: [number, number] }[];
    rows: string[][];
    uploadedData: any[] | null;
    config: any | null;
  },
): FortuneSheetData {
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
  } else if (sheet.uploadedData) {
    celldata = gridToCelldata(sheet.uploadedData, sheet.columns.map((c) => c.label));
    merges = (sheet.merges || []).map((m) => ({
      row: [m.row[0] + 1, m.row[1] + 1],
      col: [m.col[0], m.col[1]],
    }));
  } else {
    celldata = gridToCelldata(sheet.rows, sheet.columns.map((c) => c.label));
    merges = (sheet.merges || []).map((m) => ({
      row: [m.row[0] + 1, m.row[1] + 1],
      col: [m.col[0], m.col[1]],
    }));
  }

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
