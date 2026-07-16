import type { FilterSelection } from "./sheetConfig.js";

function columnLettersToIndex(letters: string): number {
  let index = 0;
  for (const letter of letters.toUpperCase()) {
    index = index * 26 + letter.charCodeAt(0) - 64;
  }
  return index - 1;
}

function columnIndexToLetters(index: number): string {
  let value = index + 1;
  let letters = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

function isValidBound(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function normalizeSelection(value: unknown): FilterSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const selection = value as Partial<FilterSelection>;
  if (!Array.isArray(selection.row) || !Array.isArray(selection.column)) return undefined;
  const row = selection.row;
  const column = selection.column;
  if (row.length !== 2 || column.length !== 2) return undefined;
  if (!row.every(isValidBound) || !column.every(isValidBound)) return undefined;
  if (row[0] > row[1] || column[0] > column[1]) return undefined;
  return {
    row: [row[0], row[1]],
    column: [column[0], column[1]],
  };
}

export function isFilterSelection(value: unknown): value is FilterSelection {
  return normalizeSelection(value) !== undefined;
}

export function excelAutoFilterRefToFortune(ref: unknown): FilterSelection | undefined {
  if (typeof ref !== "string") return undefined;
  const match = ref.trim().match(/^\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/);
  if (!match) return undefined;

  const startColumn = columnLettersToIndex(match[1]);
  const startRow = Number(match[2]) - 1;
  const endColumn = columnLettersToIndex(match[3] ?? match[1]);
  const endRow = Number(match[4] ?? match[2]) - 1;
  return normalizeSelection({
    row: [startRow, endRow],
    column: [startColumn, endColumn],
  });
}

export function fortuneFilterSelectionToExcelRef(value: unknown): string | undefined {
  const selection = normalizeSelection(value);
  if (!selection) return undefined;
  const start = `${columnIndexToLetters(selection.column[0])}${selection.row[0] + 1}`;
  const end = `${columnIndexToLetters(selection.column[1])}${selection.row[1] + 1}`;
  return start === end ? start : `${start}:${end}`;
}
