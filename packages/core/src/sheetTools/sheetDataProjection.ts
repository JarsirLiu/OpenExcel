import { fortuneMergesToToolRanges } from "../chat/sheetGeometry.js";
import type { FortuneCell } from "../excel/celldataUtils.js";
import { type FortuneCellScalar, fortuneCellValueToScalar } from "../excel/fortuneCellValue.js";
import { formulaToR1C1 } from "../formula/formulaR1C1.js";
import { planSheetReadPage, type SheetReadContinuation } from "./sheetReadPager.js";

export type SheetDataValue = Exclude<FortuneCellScalar, Date>;

export type SheetToolRange = {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};

export type FormulaPattern = {
  ranges: string[];
  formulaR1C1: string;
};

export type FormulaException = {
  cell: string;
  formula: string;
};

export type SheetMerge = {
  range: string;
  anchor: string;
  rowSpan: number;
  colSpan: number;
  clipped?: boolean;
  anchorValue?: SheetDataValue;
};

export type SheetDataProjection = {
  range: string;
  values: SheetDataValue[][];
  formulaPatterns: FormulaPattern[];
  formulaExceptions: FormulaException[];
  merges: SheetMerge[];
  continuation: SheetReadContinuation | null;
};

export type SheetDataProjectionOptions = {
  requestedRange?: SheetToolRange;
  continuation?: SheetReadContinuation;
  maxCells?: number;
};

const MAX_EXCEL_ROW = 1_048_576;
const MAX_EXCEL_COLUMN = 16_384;

function isFiniteScalar(value: FortuneCellScalar): value is Exclude<FortuneCellScalar, Date> {
  return !(value instanceof Date);
}

function scalarValue(cell: FortuneCell | undefined): SheetDataValue {
  const value = cell ? fortuneCellValueToScalar(cell.v, { inferGeneralNumeric: true }) : null;
  return isFiniteScalar(value) ? value : value.toISOString();
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function columnName(column: number): string {
  let value = column;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function toA1(row: number, col: number): string {
  return `${columnName(col)}${row}`;
}

function rangeToA1(range: SheetToolRange): string {
  const start = toA1(range.startRow, range.startCol);
  const end = toA1(range.endRow, range.endCol);
  return start === end ? start : `${start}:${end}`;
}

function usedRange(celldata: readonly FortuneCell[]): SheetToolRange {
  if (celldata.length === 0) return { startRow: 1, startCol: 1, endRow: 1, endCol: 1 };

  let maxRow = 0;
  let maxCol = 0;
  for (const cell of celldata) {
    maxRow = Math.max(maxRow, cell.r);
    maxCol = Math.max(maxCol, cell.c);
  }

  return {
    startRow: 1,
    startCol: 1,
    endRow: maxRow + 1,
    endCol: maxCol + 1,
  };
}

function intersect(left: SheetToolRange, right: SheetToolRange): boolean {
  return (
    left.startRow <= right.endRow &&
    left.endRow >= right.startRow &&
    left.startCol <= right.endCol &&
    left.endCol >= right.startCol
  );
}

function clipRange(range: SheetToolRange, bounds: SheetToolRange): SheetToolRange {
  return {
    startRow: Math.max(range.startRow, bounds.startRow),
    startCol: Math.max(range.startCol, bounds.startCol),
    endRow: Math.min(range.endRow, bounds.endRow),
    endCol: Math.min(range.endCol, bounds.endCol),
  };
}

function contiguousRanges(cells: Array<{ row: number; col: number }>): string[] {
  const remaining = new Set(cells.map((cell) => cellKey(cell.row, cell.col)));
  const result: string[] = [];
  const sorted = [...cells].sort((left, right) => left.row - right.row || left.col - right.col);

  // Prefer vertical ranges, but leave single cells for the horizontal pass.
  for (const cell of sorted) {
    const key = cellKey(cell.row, cell.col);
    if (!remaining.has(key)) continue;
    let endRow = cell.row;
    while (remaining.has(cellKey(endRow + 1, cell.col))) {
      endRow += 1;
    }
    if (endRow === cell.row) continue;
    for (let row = cell.row; row <= endRow; row += 1) {
      remaining.delete(cellKey(row, cell.col));
    }
    const range = {
      startRow: cell.row,
      startCol: cell.col,
      endRow,
      endCol: cell.col,
    };
    result.push(rangeToA1(range));
  }
  for (const cell of sorted) {
    const key = cellKey(cell.row, cell.col);
    if (!remaining.has(key)) continue;
    let endCol = cell.col;
    while (remaining.has(cellKey(cell.row, endCol + 1))) {
      remaining.delete(cellKey(cell.row, endCol));
      endCol += 1;
    }
    remaining.delete(cellKey(cell.row, endCol));
    result.push(
      rangeToA1({
        startRow: cell.row,
        startCol: cell.col,
        endRow: cell.row,
        endCol,
      }),
    );
  }
  return result;
}

function buildFormulaMetadata(
  celldata: readonly FortuneCell[],
  range: SheetToolRange,
): Pick<SheetDataProjection, "formulaPatterns" | "formulaExceptions"> {
  const groups = new Map<string, Array<{ row: number; col: number; formula: string }>>();
  for (const cell of celldata) {
    const row = cell.r + 1;
    const col = cell.c + 1;
    if (!intersect({ startRow: row, startCol: col, endRow: row, endCol: col }, range)) continue;
    if (typeof cell.v.f !== "string" || cell.v.f.trim() === "") continue;
    const pattern = formulaToR1C1(cell.v.f, cell.r, cell.c);
    const entries = groups.get(pattern) ?? [];
    entries.push({ row, col, formula: cell.v.f });
    groups.set(pattern, entries);
  }

  const formulaPatterns: FormulaPattern[] = [];
  const formulaExceptions: FormulaException[] = [];
  for (const [formulaR1C1, entries] of groups) {
    if (entries.length < 2) {
      const entry = entries[0];
      if (entry)
        formulaExceptions.push({
          cell: toA1(entry.row, entry.col),
          formula: `=${entry.formula.replace(/^=/, "")}`,
        });
      continue;
    }
    const ranges = contiguousRanges(entries.map(({ row, col }) => ({ row, col })));
    formulaPatterns.push({ ranges, formulaR1C1 });
  }
  return { formulaPatterns, formulaExceptions };
}

function buildMerges(
  celldata: readonly FortuneCell[],
  range: SheetToolRange,
  cellMap: ReadonlyMap<string, FortuneCell>,
): SheetMerge[] {
  return fortuneMergesToToolRanges([...celldata]).flatMap((merge) => {
    if (!intersect(merge, range)) return [];
    const clipped = clipRange(merge, range);
    const anchor = toA1(merge.startRow, merge.startCol);
    const anchorCell = cellMap.get(cellKey(merge.startRow - 1, merge.startCol - 1));
    const item: SheetMerge = {
      range: rangeToA1(merge),
      anchor,
      rowSpan: merge.endRow - merge.startRow + 1,
      colSpan: merge.endCol - merge.startCol + 1,
    };
    if (
      clipped.startRow !== merge.startRow ||
      clipped.startCol !== merge.startCol ||
      clipped.endRow !== merge.endRow ||
      clipped.endCol !== merge.endCol
    ) {
      item.clipped = true;
      if (anchorCell) item.anchorValue = scalarValue(anchorCell);
    }
    return [item];
  });
}

export function projectSheetData(
  celldata: readonly FortuneCell[],
  options: SheetDataProjectionOptions = {},
): SheetDataProjection {
  const fullRange = usedRange(celldata);
  const requested = options.requestedRange ?? options.continuation?.requestedRange ?? fullRange;
  if (
    requested.startRow < 1 ||
    requested.startCol < 1 ||
    requested.endRow < requested.startRow ||
    requested.endCol < requested.startCol
  ) {
    throw new Error("Invalid sheet data range");
  }
  const page = planSheetReadPage(requested, options.maxCells ?? 4_000, options.continuation);
  const limited = page.range;
  const cellMap = new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
  const values = Array.from({ length: limited.endRow - limited.startRow + 1 }, (_, rowOffset) =>
    Array.from({ length: limited.endCol - limited.startCol + 1 }, (_, colOffset) =>
      scalarValue(
        cellMap.get(cellKey(limited.startRow + rowOffset - 1, limited.startCol + colOffset - 1)),
      ),
    ),
  );
  const formula = buildFormulaMetadata(celldata, limited);
  return {
    range: rangeToA1(limited),
    values,
    ...formula,
    merges: buildMerges(celldata, limited, cellMap),
    continuation: page.continuation,
  };
}

export function sheetUsedRange(celldata: readonly FortuneCell[]): SheetToolRange {
  return usedRange(celldata);
}

export function parseSheetToolRange(value: string): SheetToolRange {
  const match = value.trim().match(/^\$?([A-Za-z]+)\$?(\d+)(?::\$?([A-Za-z]+)\$?(\d+))?$/);
  if (!match) throw new Error(`Invalid sheet range: ${value}`);
  const toColumn = (letters: string) =>
    letters
      .toUpperCase()
      .split("")
      .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0);
  const startCol = toColumn(match[1]);
  const startRow = Number(match[2]);
  const endCol = match[3] ? toColumn(match[3]) : startCol;
  const endRow = match[4] ? Number(match[4]) : startRow;
  const range = { startRow, startCol, endRow, endCol };
  if (
    !Number.isSafeInteger(startRow) ||
    !Number.isSafeInteger(endRow) ||
    startRow < 1 ||
    endRow > MAX_EXCEL_ROW ||
    startCol < 1 ||
    endCol > MAX_EXCEL_COLUMN ||
    endRow < startRow ||
    endCol < startCol
  ) {
    throw new Error(`Invalid sheet range: ${value}`);
  }
  return range;
}
