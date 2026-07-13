import type { SheetChangeClearOperation, SheetChangeRangeOperation } from "@openexcel/core";
import {
  type CellRange,
  cellRangeSize,
  type DocumentMutation,
  type DocumentOperation,
  sheetChangeCellToZeroBased,
  sheetChangeRangeToZeroBased,
} from "@openexcel/core";
import type { DocumentSheetInfo } from "./repository.js";
import * as service from "./service.js";

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

function normalizeFormula(formula?: string): string | undefined {
  if (!formula) return undefined;
  const normalized = formula.trim();
  if (!normalized) return undefined;
  return normalized.startsWith("=") ? normalized.slice(1) : normalized;
}

export function writeOperationToDocument(operation: ToolWriteOperation): DocumentOperation {
  if (operation.type === "cell") {
    const cell = sheetChangeCellToZeroBased(operation);
    const formula = normalizeFormula(operation.formula);
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
  const formula = normalizeFormula(operation.formula);
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

export async function applyToolOperations(
  workspaceId: number,
  sheetId: number,
  operations: DocumentOperation[],
  runId?: number,
) {
  const sheet = await service.getSheetInfo(workspaceId, sheetId);
  if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

  const result = await service.applyOperations(
    workspaceId,
    sheetId,
    { operations, expectedRevision: sheet.revision },
    runId,
  );
  if ("error" in result) throw new Error(result.error);
  const mutation: DocumentMutation = {
    sheetId,
    revision: result.revision,
    changedRanges: result.changedRanges,
    objectIds: result.objectIds,
  };
  return { sheet, revision: result.revision, mutation, result };
}

export async function readToolRange(workspaceId: number, sheetId: number, range: CellRange) {
  const result = await service.readRange(workspaceId, sheetId, range);
  if ("error" in result) throw new Error(result.error);
  return result;
}

export function buildToolPreview(
  sheet: Pick<DocumentSheetInfo, "sheetId" | "name">,
  range: CellRange,
  cells: Array<{ row: number; col: number; value: { value: unknown; displayValue?: string } }>,
  objects: Array<{
    type: string;
    position: Record<string, unknown>;
    data: Record<string, unknown>;
  }> = [],
) {
  const { rows, cols } = cellRangeSize(range);
  const values = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ""));
  for (const cell of cells) {
    const row = cell.row - range.startRow;
    const col = cell.col - range.startCol;
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    values[row][col] = cell.value.displayValue ?? String(cell.value.value ?? "");
  }
  const merges = objects
    .filter(isMergeObject)
    .map((object) => object.position)
    .filter(
      (position): position is Record<string, number> =>
        typeof position.startRow === "number" &&
        typeof position.startCol === "number" &&
        typeof position.endRow === "number" &&
        typeof position.endCol === "number",
    )
    .filter(
      (position) =>
        position.startRow <= range.endRow &&
        position.endRow >= range.startRow &&
        position.startCol <= range.endCol &&
        position.endCol >= range.startCol,
    )
    .map((position) => ({
      startRow: position.startRow + 1,
      startCol: position.startCol + 1,
      endRow: position.endRow + 1,
      endCol: position.endCol + 1,
    }));
  return {
    sheetId: sheet.sheetId,
    sheetName: sheet.name,
    range: {
      startRow: range.startRow + 1,
      endRow: range.endRow + 1,
      startCol: range.startCol + 1,
      endCol: range.endCol + 1,
    },
    rows: values,
    merges,
  };
}

export type ToolMergeOperation = SheetChangeRangeOperation;
