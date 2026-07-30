import { fortuneMergesToToolRanges } from "../chat/sheetGeometry.js";
import type { FortuneCell } from "../excel/celldataUtils.js";
import { fortuneCellValueToScalar, isFortuneDateCell } from "../excel/fortuneCellValue.js";
import { formulaToR1C1 } from "../formula/formulaR1C1.js";
import {
  projectSheetData,
  type SheetDataValue,
  type SheetToolRange,
  sheetUsedRange,
} from "./sheetDataProjection.js";
import {
  planSheetReadPage,
  type SheetReadContinuation,
  sheetToolRangeToA1,
} from "./sheetReadPager.js";

export type SheetTableRow = {
  row: number;
  values: SheetDataValue[];
};

export type SheetTableAnnotation = {
  cell: string;
  formula?: string;
  date?: string;
  numberFormat?: string;
};

export type SheetTableProjection = {
  range: string;
  columns: string[];
  rows: SheetTableRow[];
  merges: ReturnType<typeof projectSheetData>["merges"];
  formulaPatterns: ReturnType<typeof projectSheetData>["formulaPatterns"];
  annotations: SheetTableAnnotation[];
  continuation: SheetReadContinuation | null;
};

export type SheetOverviewColumn = {
  column: string;
  types: Array<"string" | "number" | "boolean" | "date" | "formula">;
};

export type SheetOverviewProjection = {
  usedRange: string;
  nonEmptyCellCount: number;
  mergeRanges: string[];
  formulaPatterns: Array<{ formulaR1C1: string; count: number }>;
  columns: SheetOverviewColumn[];
};

function columnName(column: number): string {
  let value = column;
  let output = "";
  while (value > 0) {
    output = String.fromCharCode(65 + ((value - 1) % 26)) + output;
    value = Math.floor((value - 1) / 26);
  }
  return output;
}

function cellAddress(row: number, col: number): string {
  return `${columnName(col)}${row}`;
}

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function cellType(cell: FortuneCell): "string" | "number" | "boolean" | "date" | "formula" {
  if (typeof cell.v.f === "string" && cell.v.f.trim() !== "") return "formula";
  if (isFortuneDateCell(cell.v)) return "date";
  const value = fortuneCellValueToScalar(cell.v, { inferGeneralNumeric: true });
  if (typeof value === "string") return "string";
  if (typeof value === "boolean") return "boolean";
  return "number";
}

function cellIsNonEmpty(cell: FortuneCell): boolean {
  if (typeof cell.v.f === "string" && cell.v.f.trim() !== "") return true;
  const value = fortuneCellValueToScalar(cell.v, { inferGeneralNumeric: true });
  return value !== null && value !== "";
}

export function projectSheetTable(
  celldata: readonly FortuneCell[],
  options: {
    requestedRange?: SheetToolRange;
    continuation?: SheetReadContinuation;
    maxCells?: number;
  } = {},
): SheetTableProjection {
  const exact = projectSheetData(celldata, options);
  const range =
    options.requestedRange ?? options.continuation?.requestedRange ?? sheetUsedRange(celldata);
  const page = planSheetReadPage(range, options.maxCells ?? 4_000, options.continuation);
  const cellMap = new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
  const dateValues = exact.dateValues ?? {};
  const formulaCounts = new Map<string, number>();
  for (const cell of celldata) {
    const row = cell.r + 1;
    const col = cell.c + 1;
    if (
      row < page.range.startRow ||
      row > page.range.endRow ||
      col < page.range.startCol ||
      col > page.range.endCol ||
      typeof cell.v.f !== "string" ||
      cell.v.f.trim() === ""
    ) {
      continue;
    }
    const pattern = formulaToR1C1(cell.v.f, cell.r, cell.c);
    formulaCounts.set(pattern, (formulaCounts.get(pattern) ?? 0) + 1);
  }
  const rows: SheetTableRow[] = [];
  const annotations: SheetTableAnnotation[] = [];

  for (let rowOffset = 0; rowOffset < exact.values.length; rowOffset += 1) {
    const rowNumber = page.range.startRow + rowOffset;
    const values = [...(exact.values[rowOffset] ?? [])];
    let lastMeaningfulColumn = -1;
    for (let colOffset = 0; colOffset < values.length; colOffset += 1) {
      const colNumber = page.range.startCol + colOffset;
      const cell = cellMap.get(cellKey(rowNumber - 1, colNumber - 1));
      const address = cellAddress(rowNumber, colNumber);
      const date = dateValues[address];
      if (date !== undefined) {
        values[colOffset] = date;
        annotations.push({ cell: address, date, numberFormat: cell?.v.ct?.fa });
      } else if (cell?.v.f) {
        const pattern = formulaToR1C1(cell.v.f, cell.r, cell.c);
        const annotation: SheetTableAnnotation = { cell: address };
        if ((formulaCounts.get(pattern) ?? 0) < 2) {
          annotation.formula = `=${cell.v.f.replace(/^=/, "")}`;
        }
        if (cell.v.ct?.fa && cell.v.ct.fa !== "General") {
          annotation.numberFormat = cell.v.ct.fa;
        }
        if (annotation.formula || annotation.numberFormat) annotations.push(annotation);
      } else if (cell?.v.ct?.fa && cell.v.ct.fa !== "General") {
        annotations.push({ cell: address, numberFormat: cell.v.ct.fa });
      }
      if (values[colOffset] !== null || date !== undefined || cell?.v.f) {
        lastMeaningfulColumn = colOffset;
      }
    }
    if (lastMeaningfulColumn >= 0) {
      rows.push({ row: rowNumber, values: values.slice(0, lastMeaningfulColumn + 1) });
    }
  }

  const columns = Array.from({ length: page.range.endCol - page.range.startCol + 1 }, (_, offset) =>
    columnName(page.range.startCol + offset),
  );

  return {
    range: exact.range,
    columns,
    rows,
    merges: exact.merges,
    formulaPatterns: exact.formulaPatterns,
    annotations,
    continuation: exact.continuation,
  };
}

export function projectSheetOverview(celldata: readonly FortuneCell[]): SheetOverviewProjection {
  const used = sheetUsedRange(celldata);
  const formulaCounts = new Map<string, number>();
  const columnTypes = new Map<number, Set<SheetOverviewColumn["types"][number]>>();
  let nonEmptyCellCount = 0;

  for (const cell of celldata) {
    if (cellIsNonEmpty(cell)) nonEmptyCellCount += 1;
    const type = cellType(cell);
    const types = columnTypes.get(cell.c + 1) ?? new Set<SheetOverviewColumn["types"][number]>();
    types.add(type);
    columnTypes.set(cell.c + 1, types);
    if (type === "formula") {
      const pattern = formulaToR1C1(cell.v.f ?? "", cell.r, cell.c);
      formulaCounts.set(pattern, (formulaCounts.get(pattern) ?? 0) + 1);
    }
  }

  return {
    usedRange: sheetToolRangeToA1(used),
    nonEmptyCellCount,
    mergeRanges: fortuneMergesToToolRanges([...celldata]).map(sheetToolRangeToA1),
    formulaPatterns: [...formulaCounts.entries()].map(([formulaR1C1, count]) => ({
      formulaR1C1,
      count,
    })),
    columns: [...columnTypes.entries()]
      .sort(([left], [right]) => left - right)
      .map(([column, types]) => ({ column: columnName(column), types: [...types] })),
  };
}
