import { MAX_CHANGED_RANGES, type SheetChangeSummary } from "../chat/sheetChange.js";
import { sheetChangeDeltaToZeroBased } from "../chat/sheetCoordinates.js";
import { formatWriteRange } from "../chat/writeRange.js";
import type { FortuneCell } from "../excel/celldataUtils.js";
import { fortuneDateCellValue, normalizeFortuneFormula } from "../excel/fortuneCellValue.js";
import { tokenizeFormula } from "../formula/formulaReferenceTokenizer.js";
import type { SheetMutation } from "./sheetMutation.js";
import { cloneSheetSnapshot, type SheetSnapshot } from "./sheetSnapshot.js";

type CellMap = Map<string, FortuneCell>;

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function parseConfig(config: Record<string, unknown> | null): Record<string, unknown> {
  return config ? structuredClone(config) : {};
}

function removeContent(cell: FortuneCell): FortuneCell | null {
  const { v: _value, m: _display, f: _formula, ...format } = cell.v;
  return Object.keys(format).length > 0 ? { ...cell, v: format as FortuneCell["v"] } : null;
}

function contentSignature(cell: FortuneCell | undefined): string {
  return JSON.stringify({ v: cell?.v.v, m: cell?.v.m ?? "", f: cell?.v.f });
}

function mapCells(celldata: FortuneCell[]): CellMap {
  return new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), { ...cell, v: { ...cell.v } }]));
}

type CellCoordinate = { row: number; col: number };

function captureBefore(
  cells: CellMap,
  touched: Map<string, { coordinate: CellCoordinate; before: string }>,
  row: number,
  col: number,
): void {
  const key = cellKey(row, col);
  if (!touched.has(key)) {
    touched.set(key, { coordinate: { row, col }, before: contentSignature(cells.get(key)) });
  }
}

function applyWrite(
  cells: CellMap,
  row: number,
  col: number,
  value: string | number | boolean,
  valueType?: "date" | "string",
  formula?: string,
  capture?: (row: number, col: number) => void,
): void {
  const key = cellKey(row, col);
  capture?.(row, col);
  const current = cells.get(key) ?? ({ r: row, c: col, v: {} } as FortuneCell);
  const nextValue: Record<string, unknown> = { ...current.v };
  const normalizedFormula = normalizeFortuneFormula(formula);
  if (valueType === "date") {
    if (typeof value !== "string" || normalizedFormula) {
      throw new Error("Date writes require a string value and cannot include a formula");
    }
    cells.set(key, { ...current, v: fortuneDateCellValue(value, current.v) });
    return;
  }
  if (!normalizedFormula && value === "") {
    const next = removeContent(current);
    if (next) cells.set(key, next);
    else cells.delete(key);
    return;
  }
  if (normalizedFormula) nextValue.f = normalizedFormula;
  else delete nextValue.f;
  if (normalizedFormula && value === "") {
    delete nextValue.v;
    delete nextValue.m;
  } else {
    nextValue.v = value;
    nextValue.m = String(value);
  }
  cells.set(key, { ...current, v: nextValue as unknown as FortuneCell["v"] });
}

function applyWriteRange(
  cells: CellMap,
  range: {
    startRow: number;
    startCol: number;
    endRow: number;
    endCol: number;
    value?: string | number | boolean;
    values?: Array<Array<string | number | boolean>>;
    valueType?: "date" | "string";
    formula?: string;
  },
  capture?: (row: number, col: number) => void,
): void {
  if (range.values) {
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const value = range.values[row - range.startRow]?.[col - range.startCol];
        if (value === undefined) throw new Error("Write matrix dimensions do not match the range");
        applyWrite(cells, row, col, value, range.valueType, undefined, capture);
      }
    }
    return;
  }
  const value = range.value ?? "";
  forEachRange(range, (row, col) =>
    applyWrite(
      cells,
      row,
      col,
      value,
      range.valueType,
      range.formula
        ? shiftFormula(range.formula, row - range.startRow, col - range.startCol)
        : undefined,
      capture,
    ),
  );
}

function shiftFormula(formula: string, rowDelta: number, colDelta: number): string {
  return tokenizeFormula(formula)
    .map((token) => {
      if (token.kind === "text") return token.value;
      const reference = token.value;
      const row = reference.absoluteRow ? reference.row : reference.row + rowDelta;
      const column = reference.absoluteColumn ? reference.column : reference.column + colDelta;
      if (row < 1 || column < 1)
        throw new Error("A shifted formula reference is outside the sheet");
      let name = "";
      for (let current = column; current > 0; current = Math.floor((current - 1) / 26)) {
        name = String.fromCharCode(65 + ((current - 1) % 26)) + name;
      }
      return `${reference.absoluteColumn ? "$" : ""}${name}${reference.absoluteRow ? "$" : ""}${row}`;
    })
    .join("");
}

function applyClear(
  cells: CellMap,
  row: number,
  col: number,
  capture?: (row: number, col: number) => void,
): void {
  const key = cellKey(row, col);
  const current = cells.get(key);
  if (!current) return;
  capture?.(row, col);
  const next = removeContent(current);
  if (next) cells.set(key, next);
  else cells.delete(key);
}

function forEachRange(
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
  callback: (row: number, col: number) => void,
): void {
  for (let row = range.startRow; row <= range.endRow; row++) {
    for (let col = range.startCol; col <= range.endCol; col++) callback(row, col);
  }
}

function applyMerge(
  cells: CellMap,
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
  capture?: (row: number, col: number) => void,
): void {
  const merge = {
    r: range.startRow,
    c: range.startCol,
    rs: range.endRow - range.startRow + 1,
    cs: range.endCol - range.startCol + 1,
  };
  forEachRange(range, (row, col) => {
    capture?.(row, col);
    const key = cellKey(row, col);
    const current = cells.get(key) ?? ({ r: row, c: col, v: {} } as FortuneCell);
    const preserved =
      row === range.startRow && col === range.startCol
        ? current
        : (removeContent(current) ?? { r: row, c: col, v: {} });
    cells.set(key, {
      ...preserved,
      v: { ...preserved.v, mc: merge } as FortuneCell["v"],
    });
  });
}

function removeMergeConfig(
  config: Record<string, unknown>,
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
): void {
  const merges = config.merge;
  if (!merges || typeof merges !== "object" || Array.isArray(merges)) return;
  const mergeEntries = merges as Record<string, unknown>;
  for (const [ref, value] of Object.entries(mergeEntries)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const merge = value as { r?: unknown; c?: unknown };
    if (
      typeof merge.r === "number" &&
      typeof merge.c === "number" &&
      merge.r >= range.startRow &&
      merge.r <= range.endRow &&
      merge.c >= range.startCol &&
      merge.c <= range.endCol
    ) {
      delete mergeEntries[ref];
    }
  }
  if (Object.keys(mergeEntries).length === 0) delete config.merge;
}

function columnRef(column: number): string {
  let result = "";
  for (let value = column; value >= 0; value = Math.floor(value / 26) - 1) {
    result = String.fromCharCode(65 + (value % 26)) + result;
  }
  return result;
}

function addMergeConfig(
  config: Record<string, unknown>,
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
): void {
  const merges =
    config.merge && typeof config.merge === "object" && !Array.isArray(config.merge)
      ? { ...(config.merge as Record<string, unknown>) }
      : {};
  merges[`${columnRef(range.startCol)}${range.startRow + 1}`] = {
    r: range.startRow,
    c: range.startCol,
    rs: range.endRow - range.startRow + 1,
    cs: range.endCol - range.startCol + 1,
  };
  config.merge = merges;
}

export function applySheetMutation(
  snapshot: SheetSnapshot,
  mutation: SheetMutation,
): {
  snapshot: SheetSnapshot;
  mutation: SheetMutation;
  changeSummary: SheetChangeSummary;
} {
  const internal = sheetChangeDeltaToZeroBased(mutation);
  const next = cloneSheetSnapshot(snapshot);
  const cells = mapCells(next.celldata);
  const touched = new Map<string, { coordinate: CellCoordinate; before: string }>();
  const capture = (row: number, col: number) => captureBefore(cells, touched, row, col);
  const config = parseConfig(next.config);
  const writeOperations = internal.type === "write" ? internal.operations : null;

  if (internal.type === "write") {
    for (const operation of writeOperations ?? []) {
      if (operation.type === "cell") {
        applyWrite(
          cells,
          operation.row,
          operation.col,
          operation.value,
          operation.valueType,
          operation.formula,
          capture,
        );
      } else {
        applyWriteRange(cells, operation, capture);
      }
    }
    for (const range of internal.merges ?? []) {
      applyMerge(cells, range, capture);
      addMergeConfig(config, range);
    }
  } else if (internal.type === "clear") {
    for (const operation of internal.operations) {
      if (operation.type === "cell") applyClear(cells, operation.row, operation.col, capture);
      else forEachRange(operation, (row, col) => applyClear(cells, row, col, capture));
    }
  } else if (internal.type === "merge") {
    for (const range of internal.operations) {
      applyMerge(cells, range, capture);
      addMergeConfig(config, range);
    }
  } else {
    for (const range of internal.operations) {
      forEachRange(range, (row, col) => {
        const key = cellKey(row, col);
        const current = cells.get(key);
        if (!current?.v.mc) return;
        const { mc: _merge, ...rest } = current.v;
        if (Object.keys(rest).length === 0) cells.delete(key);
        else cells.set(key, { ...current, v: rest });
      });
      removeMergeConfig(config, range);
    }
  }

  const updated = [...cells.values()].sort((left, right) => left.r - right.r || left.c - right.c);
  next.celldata = updated;
  next.config = Object.keys(config).length > 0 ? config : null;
  const changedCoordinates = [...touched.values()]
    .filter(
      ({ coordinate, before }) =>
        before !== contentSignature(cells.get(cellKey(coordinate.row, coordinate.col))),
    )
    .map(({ coordinate }) => [coordinate.row, coordinate.col] as [number, number]);
  const summary = createChangeSummary(changedCoordinates, internal.operations.length);

  return {
    snapshot: next,
    mutation,
    changeSummary: summary,
  };
}

export function summarizeSheetSnapshotChange(
  before: SheetSnapshot,
  after: SheetSnapshot,
  operationCount: number,
): SheetChangeSummary {
  const beforeCells = mapCells(before.celldata);
  const afterCells = mapCells(after.celldata);
  const keys = new Set([...beforeCells.keys(), ...afterCells.keys()]);
  const changedCoordinates: Array<[number, number]> = [];

  for (const key of keys) {
    if (contentSignature(beforeCells.get(key)) !== contentSignature(afterCells.get(key))) {
      const [row, col] = key.split(",").map(Number);
      changedCoordinates.push([row, col]);
    }
  }

  return createChangeSummary(changedCoordinates, operationCount);
}

function createChangeSummary(
  changedCoordinates: Array<[number, number]>,
  operationCount: number,
): SheetChangeSummary {
  const compactedRanges = compactChangedRanges(changedCoordinates);
  const changedRanges = compactedRanges.slice(0, MAX_CHANGED_RANGES);
  return {
    changedCellCount: changedCoordinates.length,
    changedRanges,
    omittedRangeCount: compactedRanges.length - changedRanges.length,
    truncated: compactedRanges.length > changedRanges.length,
    operationCount,
  };
}

function compactChangedRanges(coordinates: Array<[number, number]>): string[] {
  const byRow = new Map<number, number[]>();
  for (const [row, col] of coordinates) {
    const columns = byRow.get(row);
    if (columns) columns.push(col);
    else byRow.set(row, [col]);
  }
  const rowRanges = [...byRow.entries()]
    .sort(([left], [right]) => left - right)
    .flatMap(([row, columns]) => {
      const sorted = [...new Set(columns)].sort((left, right) => left - right);
      const ranges: string[] = [];
      let start = sorted[0];
      let previous = start;
      for (const column of sorted.slice(1)) {
        if (column !== previous + 1) {
          ranges.push(
            formatWriteRange({
              startRow: row + 1,
              startCol: start + 1,
              endRow: row + 1,
              endCol: previous + 1,
            }),
          );
          start = column;
        }
        previous = column;
      }
      if (start !== undefined) {
        ranges.push(
          formatWriteRange({
            startRow: row + 1,
            startCol: start + 1,
            endRow: row + 1,
            endCol: previous + 1,
          }),
        );
      }
      return ranges;
    });

  const byColumnRange = new Map<string, { startCol: number; endCol: number; rows: number[] }>();
  for (const range of rowRanges) {
    const parsed = range.match(/^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/);
    if (!parsed) continue;
    const startCol = columnNumber(parsed[1]);
    const endCol = columnNumber(parsed[3] ?? parsed[1]);
    const row = Number(parsed[2]) - 1;
    const key = `${startCol},${endCol}`;
    const entry = byColumnRange.get(key) ?? { startCol, endCol, rows: [] };
    entry.rows.push(row);
    byColumnRange.set(key, entry);
  }

  const merged: string[] = [];
  for (const entry of byColumnRange.values()) {
    const rows = [...entry.rows].sort((left, right) => left - right);
    let startRow = rows[0];
    let previousRow = startRow;
    for (const row of rows.slice(1)) {
      if (row !== previousRow + 1) {
        merged.push(
          formatWriteRange({
            startRow: startRow + 1,
            startCol: entry.startCol,
            endRow: previousRow + 1,
            endCol: entry.endCol,
          }),
        );
        startRow = row;
      }
      previousRow = row;
    }
    if (startRow !== undefined) {
      merged.push(
        formatWriteRange({
          startRow: startRow + 1,
          startCol: entry.startCol,
          endRow: previousRow + 1,
          endCol: entry.endCol,
        }),
      );
    }
  }

  return merged.sort((left, right) => {
    const leftMatch = left.match(/^([A-Z]+)(\d+)/);
    const rightMatch = right.match(/^([A-Z]+)(\d+)/);
    return (
      Number(leftMatch?.[2]) - Number(rightMatch?.[2]) ||
      columnNumber(leftMatch?.[1] ?? "A") - columnNumber(rightMatch?.[1] ?? "A")
    );
  });
}

function columnNumber(value: string): number {
  let result = 0;
  for (const character of value) {
    result = result * 26 + character.charCodeAt(0) - 64;
  }
  return result;
}
