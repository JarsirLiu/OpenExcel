import { celldataToGrid, toOneBasedIndex, type FortuneCell } from "@openexcel/core";

export interface SheetChangePreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface SheetChangePreview {
  sheetId: number;
  sheetName: string;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: string[][];
  merges: SheetChangePreviewMerge[];
}

function toColRef(index: number): string {
  let ref = "";
  let n = index;
  while (n >= 0) {
    ref = String.fromCharCode(65 + (n % 26)) + ref;
    n = Math.floor(n / 26) - 1;
  }
  return ref;
}

export function buildSheetChangePreview(
  celldata: FortuneCell[],
  sheetName: string,
  sheetId: number,
  minRow0: number,
  maxRow0: number,
): SheetChangePreview {
  const maxCol0 = Math.max(...celldata.map((c) => c.c), 0);
  const columnCount = maxCol0 + 1;
  const grid = celldataToGrid(celldata, columnCount);
  const rows = grid.slice(minRow0, maxRow0 + 1).map((row) => row.slice(0, columnCount));

  const merges: SheetChangePreviewMerge[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (!mc) continue;
    const row0 = cell.r;
    const col0 = cell.c;
    if (row0 < minRow0 || row0 > maxRow0) continue;

    const rs = mc.rs ?? 1;
    const cs = mc.cs ?? 1;
    merges.push({
      startRow: toOneBasedIndex(row0),
      startCol: toOneBasedIndex(col0),
      endRow: toOneBasedIndex(row0 + rs - 1),
      endCol: toOneBasedIndex(col0 + cs - 1),
    });
  }

  return {
    sheetId,
    sheetName,
    range: {
      startRow: toOneBasedIndex(minRow0),
      endRow: toOneBasedIndex(maxRow0),
      startCol: 1,
      endCol: columnCount,
    },
    rows,
    merges,
  };
}

export function toA1Range(rowStart1: number, colStart1: number, rowEnd1: number, colEnd1: number): string {
  return `${toA1CellRef(rowStart1, colStart1)}:${toA1CellRef(rowEnd1, colEnd1)}`;
}

export function toA1CellRef(row1: number, col1: number): string {
  return `${toColRef(col1 - 1)}${row1}`;
}
