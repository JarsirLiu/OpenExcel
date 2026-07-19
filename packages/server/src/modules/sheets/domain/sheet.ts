import {
  celldataToGrid,
  type FortuneCell,
  fortuneMergesToToolRanges,
  normalizeFortuneFormula,
  type StorageIndex,
  storageIndex,
  storageIndexToTool,
  storageRangeToTool,
  type ToolIndex,
} from "@openexcel/core";

export interface SheetChangePreviewMerge {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
  clipped: boolean;
}

/**
 * 预览行携带显式的 1-based 行号，避免前端通过数组下标自行换算。
 * 即使中间存在空行，行号也能对齐 Excel 视觉位置。
 */
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
}

export type CellWriteValue = string | number | boolean;

export type WriteCellOperation =
  | { type: "cell"; row: number; col: number; value: CellWriteValue; formula?: string }
  | {
      type: "range";
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
      value: CellWriteValue;
      formula?: string;
    };

export type WriteCellsInput = {
  sheetId: number;
  operations: WriteCellOperation[];
};

export type NormalizedWriteCellsInput = {
  sheetId: number;
  operations: WriteCellOperation[];
};

export function buildSheetChangePreview(
  celldata: FortuneCell[],
  sheetName: string,
  sheetId: number,
  minRow0: StorageIndex,
  maxRow0: StorageIndex,
): SheetChangePreview {
  const maxCol0 = Math.max(...celldata.map((c) => c.c), 0);
  const columnCount = maxCol0 + 1;
  const grid = celldataToGrid(celldata, columnCount);
  const previewRange = storageRangeToTool({
    startRow: minRow0,
    startCol: storageIndex(0),
    endRow: maxRow0,
    endCol: storageIndex(Math.max(0, columnCount - 1)),
  });
  const rows: SheetChangePreviewRow[] = [];
  for (let row0 = minRow0; row0 <= maxRow0; row0 = storageIndex(row0 + 1)) {
    const gridRow = grid[row0] ?? Array(columnCount).fill("");
    rows.push({ row: storageIndexToTool(row0), values: gridRow.slice(0, columnCount) });
  }

  const merges: SheetChangePreviewMerge[] = fortuneMergesToToolRanges(celldata).flatMap((merge) => {
    // 只有锚点在当前预览中时才返回合并区域；否则预览没有锚点值，无法正确渲染。
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
    range: {
      ...previewRange,
    },
    rows,
    merges,
  };
}

export function normalizeWriteOperations(input: WriteCellsInput): NormalizedWriteCellsInput {
  return {
    sheetId: input.sheetId,
    operations: input.operations.map((operation) =>
      operation.type === "cell"
        ? {
            type: "cell",
            row: operation.row,
            col: operation.col,
            value: operation.value,
            formula: operation.formula,
          }
        : {
            type: "range",
            startRow: operation.startRow,
            startCol: operation.startCol,
            endRow: operation.endRow,
            endCol: operation.endCol,
            value: operation.value,
            formula: operation.formula,
          },
    ),
  };
}

export function stripCellContent(
  value: Record<string, unknown> | undefined | null,
): Record<string, unknown> | null {
  if (!value) return null;
  const { v: _cellValue, m: _displayValue, f: _formula, ...rest } = value;
  return Object.keys(rest).length > 0 ? rest : null;
}

export function applyCellWrite(
  cellMap: Map<string, any>,
  touchedCells: Map<
    string,
    { row: ToolIndex; col: ToolIndex; value: CellWriteValue; formula?: string }
  >,
  row0: StorageIndex,
  col0: StorageIndex,
  value: CellWriteValue,
  formula?: string,
) {
  const key = `${row0},${col0}`;
  const normalizedFormula = normalizeFortuneFormula(formula);
  if (cellMap.has(key)) {
    const existing = cellMap.get(key);
    const nextValue: Record<string, unknown> = { ...(existing.v ?? {}) };
    if (normalizedFormula) {
      nextValue.f = normalizedFormula;
    } else {
      delete nextValue.f;
    }

    if (value !== undefined) {
      nextValue.v = value;
      nextValue.m = String(value);
    } else {
      delete nextValue.v;
      delete nextValue.m;
    }

    existing.v = nextValue;
  } else {
    const nextValue: Record<string, unknown> = {};
    if (normalizedFormula) {
      nextValue.f = normalizedFormula;
    }
    if (value !== undefined) {
      nextValue.v = value;
      nextValue.m = String(value);
    }
    const newCell = { r: row0, c: col0, v: nextValue };
    cellMap.set(key, newCell);
  }

  touchedCells.set(key, {
    row: storageIndexToTool(row0),
    col: storageIndexToTool(col0),
    value,
    formula: normalizedFormula,
  });
}

export function applyClearOperation(
  cellMap: Map<string, any>,
  operation:
    | { type: "cell"; row: StorageIndex; col: StorageIndex }
    | {
        type: "range";
        startRow: StorageIndex;
        startCol: StorageIndex;
        endRow: StorageIndex;
        endCol: StorageIndex;
      },
) {
  const touchedKeys: string[] = [];

  const clearCell = (row0: number, col0: number) => {
    const key = `${row0},${col0}`;
    const cell = cellMap.get(key);
    if (!cell?.v) return;

    const cleaned = stripCellContent(cell.v);
    if (cleaned) {
      cell.v = cleaned;
    } else {
      cellMap.delete(key);
    }
    touchedKeys.push(key);
  };

  if (operation.type === "cell") {
    clearCell(operation.row, operation.col);
    return touchedKeys;
  }

  for (let r = operation.startRow; r <= operation.endRow; r = storageIndex(r + 1)) {
    for (let c = operation.startCol; c <= operation.endCol; c = storageIndex(c + 1)) {
      clearCell(r, c);
    }
  }
  return touchedKeys;
}

export function applyMergeOperation(
  cellMap: Map<string, any>,
  operation: {
    startRow: StorageIndex;
    startCol: StorageIndex;
    endRow: StorageIndex;
    endCol: StorageIndex;
  },
) {
  const rs = operation.endRow - operation.startRow + 1;
  const cs = operation.endCol - operation.startCol + 1;

  for (let r = operation.startRow; r <= operation.endRow; r = storageIndex(r + 1)) {
    for (let c = operation.startCol; c <= operation.endCol; c = storageIndex(c + 1)) {
      const key = `${r},${c}`;
      if (r === operation.startRow && c === operation.startCol) {
        const cell = cellMap.get(key) ?? { r, c, v: {} };
        cell.v = { ...cell.v, mc: { r: operation.startRow, c: operation.startCol, rs, cs } };
        cellMap.set(key, cell);
      } else {
        const cell = cellMap.get(key) ?? { r, c, v: {} };
        cell.v = { mc: { r: operation.startRow, c: operation.startCol, rs, cs } };
        cellMap.set(key, cell);
      }
    }
  }
}
