import {
  type FortuneCell,
  normalizeFortuneFormula,
  type StorageIndex,
  storageIndex,
  storageIndexToTool,
  type ToolIndex,
} from "@openexcel/core";

export type SheetCellContentSnapshot = {
  value: unknown;
  display: string;
  formula?: string;
};

export function snapshotCellContent(cell: FortuneCell | undefined): SheetCellContentSnapshot {
  return {
    value: cell?.v.v,
    display: cell?.v.m ?? "",
    formula: cell?.v.f,
  };
}

export function cellContentEqual(
  left: SheetCellContentSnapshot | undefined,
  right: SheetCellContentSnapshot,
): boolean {
  return (
    Object.is(left?.value, right.value) &&
    left?.display === right.display &&
    left?.formula === right.formula
  );
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

    const hasContent =
      cell.v.v != null || (cell.v.m != null && cell.v.m !== "") || cell.v.f !== undefined;
    if (!hasContent) return;

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
