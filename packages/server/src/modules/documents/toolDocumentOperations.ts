import type { SheetChangeClearOperation, SheetChangeRangeOperation } from "@openexcel/core";
import {
  type CellRange,
  type DocumentOperation,
  sheetChangeCellToZeroBased,
  sheetChangeRangeToZeroBased,
} from "@openexcel/core";

export type ToolWriteOperation =
  | { type: "cell"; row: number; col: number; value: string | number | boolean; formula?: string }
  | {
      type: "range";
      startRow: number;
      startCol: number;
      endRow: number;
      endCol: number;
      value: string | number | boolean;
      formula?: string;
    };

export function normalizeToolFormula(formula?: string): string | undefined {
  if (!formula) return undefined;
  const normalized = formula.trim();
  if (!normalized) return undefined;
  return normalized.startsWith("=") ? normalized.slice(1) : normalized;
}

export function writeOperationToDocument(operation: ToolWriteOperation): DocumentOperation {
  if (operation.type === "cell") {
    const cell = sheetChangeCellToZeroBased(operation);
    const formula = normalizeToolFormula(operation.formula);
    return {
      type: "setCell",
      row: cell.row,
      col: cell.col,
      value: {
        value: operation.value,
        displayValue: String(operation.value),
        ...(formula ? { formula } : {}),
      },
    };
  }

  const range = sheetChangeRangeToZeroBased(operation);
  const rows = range.endRow - range.startRow + 1;
  const cols = range.endCol - range.startCol + 1;
  const formula = normalizeToolFormula(operation.formula);
  return {
    type: "setRangeValues",
    range,
    values: Array.from({ length: rows }, () => Array.from({ length: cols }, () => operation.value)),
    ...(formula
      ? {
          formulas: Array.from({ length: rows }, () => Array.from({ length: cols }, () => formula)),
        }
      : {}),
  };
}

export function clearOperationToDocument(operation: SheetChangeClearOperation): DocumentOperation {
  if (operation.type === "cell") {
    return {
      type: "clearRange",
      range: {
        startRow: operation.row - 1,
        startCol: operation.col - 1,
        endRow: operation.row - 1,
        endCol: operation.col - 1,
      },
    };
  }
  return { type: "clearRange", range: sheetChangeRangeToZeroBased(operation) };
}

export function rangeForWriteOperation(operation: ToolWriteOperation): CellRange {
  if (operation.type === "cell") {
    const cell = sheetChangeCellToZeroBased(operation);
    return { startRow: cell.row, startCol: cell.col, endRow: cell.row, endCol: cell.col };
  }
  return sheetChangeRangeToZeroBased(operation);
}

export function rangeForClearOperation(operation: SheetChangeClearOperation): CellRange {
  return operation.type === "cell"
    ? {
        startRow: operation.row - 1,
        startCol: operation.col - 1,
        endRow: operation.row - 1,
        endCol: operation.col - 1,
      }
    : sheetChangeRangeToZeroBased(operation);
}

export function mergeOperationToDocument(operation: SheetChangeRangeOperation): DocumentOperation {
  const range = sheetChangeRangeToZeroBased(operation);
  return {
    type: "createObject",
    object: {
      id: `merge:${range.startRow}:${range.startCol}:${range.endRow}:${range.endCol}`,
      type: "custom",
      position: range,
      data: { kind: "merge" },
    },
  };
}

export function isMergeObject(object: { type: string; data: Record<string, unknown> }): boolean {
  return object.type === "custom" && object.data.kind === "merge";
}

export function mergeRanges(ranges: CellRange[]): CellRange {
  return ranges.reduce(
    (current, range) => ({
      startRow: Math.min(current.startRow, range.startRow),
      startCol: Math.min(current.startCol, range.startCol),
      endRow: Math.max(current.endRow, range.endRow),
      endCol: Math.max(current.endCol, range.endCol),
    }),
    ranges[0] ?? { startRow: 0, startCol: 0, endRow: 0, endCol: 0 },
  );
}

export type ToolMergeOperation = SheetChangeRangeOperation;
