import {
  type FortuneCell,
  fortuneMergesToToolRanges,
  type StorageIndex,
  storageIndex,
  storageIndexToTool,
  storageRangeToTool,
} from "@openexcel/core";

const MAX_PREVIEW_ROWS = 50;
const MAX_PREVIEW_COLUMNS = 32;

export interface SheetChangePreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  clipped: boolean;
}

export interface SheetChangePreviewRow {
  row: number;
  values: string[];
}

export interface SheetChangePreview {
  sheetId: number;
  sheetName: string;
  range: { startRow: number; endRow: number; startCol: number; endCol: number };
  rows: SheetChangePreviewRow[];
  merges: SheetChangePreviewMerge[];
  truncated: boolean;
}

export type SheetPreviewColumnRange = {
  startCol: StorageIndex;
  endCol: StorageIndex;
};

export function buildSheetChangePreview(
  celldata: FortuneCell[],
  sheetName: string,
  sheetId: number,
  minRow0: StorageIndex,
  maxRow0: StorageIndex,
  columnRange?: SheetPreviewColumnRange,
): SheetChangePreview {
  const maxSheetCol0 = Math.max(...celldata.map((cell) => cell.c), 0);
  const requestedStartCol0 = columnRange?.startCol ?? storageIndex(0);
  const requestedEndCol0 = columnRange?.endCol ?? storageIndex(maxSheetCol0);
  const startCol0 = Math.max(0, requestedStartCol0);
  const endCol0 = Math.min(
    Math.max(startCol0, requestedEndCol0),
    startCol0 + MAX_PREVIEW_COLUMNS - 1,
  );
  const endRow0 = Math.min(maxRow0, minRow0 + MAX_PREVIEW_ROWS - 1);
  const previewRange = storageRangeToTool({
    startRow: minRow0,
    startCol: storageIndex(startCol0),
    endRow: storageIndex(endRow0),
    endCol: storageIndex(endCol0),
  });

  const values = new Map<string, string>();
  for (const cell of celldata) {
    if (cell.r >= minRow0 && cell.r <= endRow0 && cell.c >= startCol0 && cell.c <= endCol0) {
      values.set(`${cell.r},${cell.c}`, String(cell.v?.v ?? ""));
    }
  }

  const rows: SheetChangePreviewRow[] = [];
  for (let row0 = minRow0; row0 <= endRow0; row0 = storageIndex(row0 + 1)) {
    const rowValues: string[] = [];
    for (let col0 = startCol0; col0 <= endCol0; col0 += 1) {
      rowValues.push(values.get(`${row0},${col0}`) ?? "");
    }
    rows.push({ row: storageIndexToTool(row0), values: rowValues });
  }

  const merges = fortuneMergesToToolRanges(celldata).flatMap((merge) => {
    if (
      merge.startRow < previewRange.startRow ||
      merge.startRow > previewRange.endRow ||
      merge.startCol < previewRange.startCol ||
      merge.startCol > previewRange.endCol
    ) {
      return [];
    }

    const endRow = Math.min(merge.endRow, previewRange.endRow);
    const endCol = Math.min(merge.endCol, previewRange.endCol);
    return [
      {
        startRow: merge.startRow,
        startCol: merge.startCol,
        endRow,
        endCol,
        clipped: endRow !== merge.endRow || endCol !== merge.endCol,
      },
    ];
  });

  return {
    sheetId,
    sheetName,
    range: { ...previewRange },
    rows,
    merges,
    truncated: endRow0 < maxRow0 || endCol0 < requestedEndCol0,
  };
}
