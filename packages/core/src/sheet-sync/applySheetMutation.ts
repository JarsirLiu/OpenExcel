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

function applyWrite(
  cells: CellMap,
  row: number,
  col: number,
  value: string | number | boolean,
  valueType?: "date" | "string",
  formula?: string,
): void {
  const key = cellKey(row, col);
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
): void {
  if (range.values) {
    for (let row = range.startRow; row <= range.endRow; row++) {
      for (let col = range.startCol; col <= range.endCol; col++) {
        const value = range.values[row - range.startRow]?.[col - range.startCol];
        if (value === undefined) throw new Error("Write matrix dimensions do not match the range");
        applyWrite(cells, row, col, value, range.valueType);
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

function applyClear(cells: CellMap, row: number, col: number): void {
  const key = cellKey(row, col);
  const current = cells.get(key);
  if (!current) return;
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
): void {
  const merge = {
    r: range.startRow,
    c: range.startCol,
    rs: range.endRow - range.startRow + 1,
    cs: range.endCol - range.startCol + 1,
  };
  forEachRange(range, (row, col) => {
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
  changeSummary: { changedCellCount: number; changedRanges: string[]; operationCount: number };
} {
  const next = cloneSheetSnapshot(snapshot);
  const cells = mapCells(next.celldata);
  const before = new Map([...cells].map(([key, cell]) => [key, contentSignature(cell)]));
  const config = parseConfig(next.config);
  const internal = sheetChangeDeltaToZeroBased(mutation);
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
        );
      } else {
        applyWriteRange(cells, operation);
      }
    }
    for (const range of internal.merges ?? []) {
      applyMerge(cells, range);
      addMergeConfig(config, range);
    }
  } else if (internal.type === "clear") {
    for (const operation of internal.operations) {
      if (operation.type === "cell") applyClear(cells, operation.row, operation.col);
      else forEachRange(operation, (row, col) => applyClear(cells, row, col));
    }
  } else if (internal.type === "merge") {
    for (const range of internal.operations) {
      applyMerge(cells, range);
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
  const changedCellCount =
    [...cells].filter(([key, cell]) => before.get(key) !== contentSignature(cell)).length +
    [...before.keys()].filter((key) => !cells.has(key)).length;

  const changedCoordinates = [...cells.keys()]
    .filter((key) => before.get(key) !== contentSignature(cells.get(key)))
    .concat([...before.keys()].filter((key) => !cells.has(key)))
    .map((key) => key.split(",").map(Number) as [number, number]);
  const changedRanges = compactChangedRanges(changedCoordinates);

  return {
    snapshot: next,
    mutation,
    changeSummary: {
      changedCellCount,
      changedRanges,
      operationCount: internal.operations.length,
    },
  };
}

function compactChangedRanges(coordinates: Array<[number, number]>): string[] {
  const byRow = new Map<number, number[]>();
  for (const [row, col] of coordinates) byRow.set(row, [...(byRow.get(row) ?? []), col]);
  return [...byRow.entries()]
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
}
