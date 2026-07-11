import type { CellRange } from "./model.js";

function columnLettersToIndex(letters: string): number {
  let value = 0;
  for (const letter of letters.toUpperCase()) {
    value = value * 26 + letter.charCodeAt(0) - 64;
  }
  return value - 1;
}

function indexToColumnLetters(index: number): string {
  if (!Number.isInteger(index) || index < 0) {
    throw new Error("Column index must be a non-negative integer");
  }

  let current = index + 1;
  let result = "";
  while (current > 0) {
    const remainder = (current - 1) % 26;
    result = String.fromCharCode(65 + remainder) + result;
    current = Math.floor((current - 1) / 26);
  }
  return result;
}

function parseCellReference(reference: string): { row: number; col: number } {
  const match = /^\$?([A-Za-z]+)\$?(\d+)$/.exec(reference.trim());
  if (!match) {
    throw new Error(`Invalid A1 cell reference: ${reference}`);
  }

  const row = Number(match[2]) - 1;
  const col = columnLettersToIndex(match[1]);
  if (row < 0 || col < 0) {
    throw new Error(`Invalid A1 cell reference: ${reference}`);
  }
  return { row, col };
}

export function parseA1Cell(reference: string): { row: number; col: number } {
  const normalized = reference.includes("!") ? reference.split("!").pop() : reference;
  return parseCellReference(normalized ?? reference);
}

export function parseA1Range(reference: string): CellRange {
  const normalized = reference.includes("!") ? reference.split("!").pop() : reference;
  const parts = (normalized ?? reference).split(":");
  if (parts.length > 2) {
    throw new Error(`Invalid A1 range: ${reference}`);
  }

  const start = parseCellReference(parts[0]);
  const end = parseCellReference(parts[1] ?? parts[0]);
  const range: CellRange = {
    startRow: Math.min(start.row, end.row),
    startCol: Math.min(start.col, end.col),
    endRow: Math.max(start.row, end.row),
    endCol: Math.max(start.col, end.col),
  };
  return range;
}

export function formatA1Cell(row: number, col: number): string {
  if (!Number.isInteger(row) || row < 0) {
    throw new Error("Row index must be a non-negative integer");
  }
  return `${indexToColumnLetters(col)}${row + 1}`;
}

export function formatA1Range(range: CellRange): string {
  validateCellRange(range);
  const start = formatA1Cell(range.startRow, range.startCol);
  const end = formatA1Cell(range.endRow, range.endCol);
  return start === end ? start : `${start}:${end}`;
}

export function validateCellRange(range: CellRange): void {
  const values = [range.startRow, range.startCol, range.endRow, range.endCol];
  if (values.some((value) => !Number.isInteger(value) || value < 0)) {
    throw new Error("Cell range coordinates must be non-negative integers");
  }
  if (range.endRow < range.startRow || range.endCol < range.startCol) {
    throw new Error("Cell range end must not precede its start");
  }
}

export function cellRangeSize(range: CellRange): { rows: number; cols: number } {
  validateCellRange(range);
  return {
    rows: range.endRow - range.startRow + 1,
    cols: range.endCol - range.startCol + 1,
  };
}
