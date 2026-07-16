import {
  celldataToGrid,
  type FortuneCell,
  normalizeFortuneFormula,
  toOneBasedIndex,
} from "@openexcel/core";

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

export interface SheetChangeRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
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

export function parseMergesFromCelldata(
  celldata: any[],
): { startRow: number; startCol: number; endRow: number; endCol: number }[] {
  const merges: { startRow: number; startCol: number; endRow: number; endCol: number }[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (mc) {
      const r = cell.r;
      const c = cell.c;
      merges.push({
        startRow: toOneBasedIndex(r),
        startCol: toOneBasedIndex(c),
        endRow: toOneBasedIndex(r + (mc.rs ?? 1) - 1),
        endCol: toOneBasedIndex(c + (mc.cs ?? 1) - 1),
      });
    }
  }
  return merges;
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

export function toA1CellRef(row1: number, col1: number): string {
  return `${toColRef(col1 - 1)}${row1}`;
}

export function toA1Range(
  rowStart1: number,
  colStart1: number,
  rowEnd1: number,
  colEnd1: number,
): string {
  return `${toA1CellRef(rowStart1, colStart1)}:${toA1CellRef(rowEnd1, colEnd1)}`;
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
  touchedCells: Map<string, { row: number; col: number; value: CellWriteValue; formula?: string }>,
  row0: number,
  col0: number,
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
    row: row0 + 1,
    col: col0 + 1,
    value,
    formula: normalizedFormula,
  });
}

export function applyClearOperation(
  cellMap: Map<string, any>,
  operation:
    | { type: "cell"; row: number; col: number }
    | { type: "range"; startRow: number; startCol: number; endRow: number; endCol: number },
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

  for (let r = operation.startRow; r <= operation.endRow; r += 1) {
    for (let c = operation.startCol; c <= operation.endCol; c += 1) {
      clearCell(r, c);
    }
  }
  return touchedKeys;
}

export function applyMergeOperation(cellMap: Map<string, any>, operation: SheetChangeRange) {
  const rs = operation.endRow - operation.startRow + 1;
  const cs = operation.endCol - operation.startCol + 1;

  for (let r = operation.startRow; r <= operation.endRow; r += 1) {
    for (let c = operation.startCol; c <= operation.endCol; c += 1) {
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
