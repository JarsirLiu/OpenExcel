import type { FortuneCell } from "../excel/celldataUtils.js";
import { fortuneCellValueToScalar, isFortuneDateCell } from "../excel/fortuneCellValue.js";
import { normalizeColorQuery } from "../excel/fortuneStyle.js";
import { formulaToR1C1 } from "../formula/formulaR1C1.js";
import { type SheetDataValue, type SheetToolRange, sheetUsedRange } from "./sheetDataProjection.js";

const DEFAULT_MAX_QUERY_CELLS = 100_000;

export type SheetCellQuery = {
  value?: SheetDataValue;
  valueType?: "empty" | "string" | "number" | "boolean" | "date" | "formula";
  formula?: "exists" | { exact: string } | { r1c1: string };
  style?: {
    fill?: string;
    fontColor?: string;
    bold?: boolean;
    numberFormat?: string;
  };
};

export type SheetCellQueryOptions = {
  range?: SheetToolRange;
  maxCells?: number;
};

export type SheetCellMatch = {
  range: string;
  count: number;
  reason: string;
  color?: string;
};

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function cellValue(cell: FortuneCell): SheetDataValue {
  const value = fortuneCellValueToScalar(cell.v, { inferGeneralNumeric: true });
  return value instanceof Date ? value.toISOString() : value;
}

function isFormula(cell: FortuneCell | undefined): boolean {
  return typeof cell?.v.f === "string" && cell.v.f.trim() !== "";
}

function isEmptyValue(cell: FortuneCell | undefined, value: SheetDataValue): boolean {
  return !isFormula(cell) && (cell == null || value == null || value === "");
}

function normalizeStyleQuery(style: SheetCellQuery["style"]): SheetCellQuery["style"] {
  if (!style) return undefined;
  return {
    ...style,
    fill: style.fill === undefined ? undefined : (normalizeColorQuery(style.fill) ?? ""),
    fontColor:
      style.fontColor === undefined ? undefined : (normalizeColorQuery(style.fontColor) ?? ""),
  };
}

function normalizeQuery(query: SheetCellQuery): SheetCellQuery {
  return { ...query, style: normalizeStyleQuery(query.style) };
}

function matchesValue(cell: FortuneCell | undefined, query: SheetCellQuery): boolean {
  const value = cell ? cellValue(cell) : null;
  if (query.value !== undefined && value !== query.value) return false;
  if (query.valueType) {
    const type = isFormula(cell)
      ? "formula"
      : isEmptyValue(cell, value)
        ? "empty"
        : cell && isFortuneDateCell(cell.v)
          ? "date"
          : typeof value;
    if (type !== query.valueType) return false;
  }
  if (query.formula) {
    const formula = cell?.v.f;
    if (!cell || typeof formula !== "string" || formula.trim() === "") return false;
    if (query.formula !== "exists") {
      const expected = "exact" in query.formula ? query.formula.exact : query.formula.r1c1;
      const actual =
        "exact" in query.formula
          ? `=${formula.replace(/^=/, "")}`
          : formulaToR1C1(formula, cell.r, cell.c);
      if (actual !== expected) return false;
    }
  }
  if (query.style) {
    if (!cell) return false;
    const style = query.style;
    if (style.fill !== undefined && normalizeColorQuery(cell.v.bg) !== style.fill) return false;
    if (style.fontColor !== undefined && normalizeColorQuery(cell.v.fc) !== style.fontColor)
      return false;
    if (style.bold !== undefined && Boolean(cell.v.bl) !== style.bold) return false;
    if (style.numberFormat && cell.v.ct?.fa !== style.numberFormat) return false;
  }
  return true;
}

function queryNeedsGridScan(query: SheetCellQuery): boolean {
  return query.valueType === "empty" || query.value === null || query.value === "";
}

function isWithinRange(cell: FortuneCell, range: SheetToolRange): boolean {
  const row = cell.r + 1;
  const col = cell.c + 1;
  return (
    row >= range.startRow && row <= range.endRow && col >= range.startCol && col <= range.endCol
  );
}

function buildCandidateCells(
  celldata: readonly FortuneCell[],
  range: SheetToolRange,
  query: SheetCellQuery,
  maxCells: number,
): FortuneCell[] {
  if (!queryNeedsGridScan(query)) {
    return celldata.filter((cell) => isWithinRange(cell, range));
  }

  assertQueryRange(range, maxCells);
  const cellMap = new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
  const candidates: FortuneCell[] = [];
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      candidates.push(
        cellMap.get(cellKey(row - 1, col - 1)) ?? {
          r: row - 1,
          c: col - 1,
          v: { v: null, m: "" },
        },
      );
    }
  }
  return candidates;
}

function assertQueryRange(range: SheetToolRange, maxCells: number): void {
  const cellCount = (range.endRow - range.startRow + 1) * (range.endCol - range.startCol + 1);
  if (!Number.isInteger(maxCells) || maxCells < 1) {
    throw new Error("Invalid sheet cell query limit");
  }
  if (cellCount > maxCells) {
    throw new Error("Sheet cell query range exceeds the limit; narrow the range and retry");
  }
}

function columnName(column: number): string {
  let value = column + 1;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function toA1(row: number, col: number): string {
  return `${columnName(col)}${row + 1}`;
}

function toRange(startRow: number, startCol: number, endRow: number, endCol: number): string {
  const start = toA1(startRow, startCol);
  const end = toA1(endRow, endCol);
  return start === end ? start : `${start}:${end}`;
}

function buildMatches(
  cells: FortuneCell[],
  match: Pick<SheetCellMatch, "reason" | "color">,
): SheetCellMatch[] {
  const remaining = new Set(cells.map((cell) => cellKey(cell.r, cell.c)));
  const sorted = [...cells].sort((left, right) => left.r - right.r || left.c - right.c);
  const matches: SheetCellMatch[] = [];
  for (const cell of sorted) {
    if (!remaining.has(cellKey(cell.r, cell.c))) continue;
    let endRow = cell.r;
    while (remaining.has(cellKey(endRow + 1, cell.c))) endRow += 1;
    if (endRow > cell.r) {
      for (let row = cell.r; row <= endRow; row += 1) remaining.delete(cellKey(row, cell.c));
      matches.push({
        range: toRange(cell.r, cell.c, endRow, cell.c),
        count: endRow - cell.r + 1,
        ...match,
      });
      continue;
    }
    let endCol = cell.c;
    while (remaining.has(cellKey(cell.r, endCol + 1))) endCol += 1;
    for (let col = cell.c; col <= endCol; col += 1) remaining.delete(cellKey(cell.r, col));
    matches.push({
      range: toRange(cell.r, cell.c, cell.r, endCol),
      count: endCol - cell.c + 1,
      ...match,
    });
  }
  return matches;
}

export function querySheetCells(
  celldata: readonly FortuneCell[],
  query: SheetCellQuery,
  options: SheetCellQueryOptions = {},
): SheetCellMatch[] {
  const normalizedQuery = normalizeQuery(query);
  const range = options.range ?? sheetUsedRange(celldata);
  const maxCells = options.maxCells ?? DEFAULT_MAX_QUERY_CELLS;
  const candidates = buildCandidateCells(celldata, range, normalizedQuery, maxCells);
  const matched = candidates.filter((cell) => matchesValue(cell, normalizedQuery));
  const fill = normalizedQuery.style?.fill;
  const fontColor = normalizedQuery.style?.fontColor;
  const reason = [
    normalizedQuery.value !== undefined ? `value=${String(normalizedQuery.value)}` : null,
    normalizedQuery.valueType ? `type=${normalizedQuery.valueType}` : null,
    normalizedQuery.formula
      ? `formula=${normalizedQuery.formula === "exists" ? "exists" : "specified"}`
      : null,
    query.style?.fill ? `fill=${fill ?? query.style.fill}` : null,
    query.style?.fontColor ? `fontColor=${fontColor ?? query.style.fontColor}` : null,
    normalizedQuery.style?.bold !== undefined ? `bold=${normalizedQuery.style.bold}` : null,
    normalizedQuery.style?.numberFormat
      ? `numberFormat=${normalizedQuery.style.numberFormat}`
      : null,
  ]
    .filter((item): item is string => item != null)
    .join(", ");
  return buildMatches(matched, {
    reason: reason || "matched",
    color: fill ?? (fontColor && !fill ? fontColor : undefined),
  });
}
