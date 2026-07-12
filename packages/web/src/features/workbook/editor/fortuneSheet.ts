import type { FortuneCell, FortuneSheetData, SheetConfig } from "@openexcel/core";
import { restoreSheetConfig } from "@openexcel/core";

export type { FortuneCell, FortuneSheetData, SheetConfig };

export function extractMergesFromCelldata(
  celldata: FortuneCell[],
): { row: [number, number]; col: [number, number] }[] {
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

export function toFortuneSheetData(sheet: {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  config: any | null;
}): FortuneSheetData {
  const celldata: FortuneCell[] = [];

  const result: FortuneSheetData = {
    id: String(sheet.id),
    name: sheet.name,
    celldata,
    columnWidths: sheet.columns.reduce((acc: Record<string, number>, col, i) => {
      if (col.width) acc[i] = col.width;
      return acc;
    }, {}),
    merges: [],
  };

  if (sheet.config && typeof sheet.config === "object") {
    restoreSheetConfig(result, sheet.config as SheetConfig);
  }

  return result;
}
