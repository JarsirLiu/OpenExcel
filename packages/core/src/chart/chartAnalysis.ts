import type { FortuneCell } from "../excel/celldataUtils.js";
import type { ChartSeriesSpec, ChartSpec, RangeReference } from "./chartModel.js";
import { cellAddressToA1 } from "./chartReference.js";

export type ChartDataSheet = {
  id: string;
  celldata: readonly FortuneCell[];
};

export type ChartSeriesData = {
  id: string;
  name: string;
  data: Array<number | null>;
  chartType?: ChartSeriesSpec["chartType"];
};

export type ChartData = {
  categories: string[];
  series: ChartSeriesData[];
};

export type ChartSeriesDataQuality = {
  seriesId: string;
  name: string;
  pointCount: number;
  missingValueIndexes: number[];
  nonNumericValueIndexes: number[];
  formulaCells: string[];
  unresolvedFormulaCells: string[];
};

export type ChartDataQuality = {
  categoryCount: number;
  missingCategoryIndexes: number[];
  series: ChartSeriesDataQuality[];
};

export function chartReferenceLength(reference: RangeReference): number {
  return (
    Math.max(reference.end.row - reference.start.row, reference.end.col - reference.start.col) + 1
  );
}

export function chartDependencySheetIds(spec: ChartSpec): string[] {
  const ids = [spec.sheetId];
  for (const series of spec.series) {
    ids.push(series.valueRef.sheetId);
    if (series.categoryRef) ids.push(series.categoryRef.sheetId);
    if (typeof series.name === "object") ids.push(series.name.sheetId);
  }
  return [...new Set(ids)];
}

type IndexedChartDataSheet = {
  id: string;
  cells: ReadonlyMap<string, FortuneCell["v"]>;
};

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function indexSheet(sheet: ChartDataSheet): IndexedChartDataSheet {
  return {
    id: sheet.id,
    cells: new Map(sheet.celldata.map((cell) => [cellKey(cell.r, cell.c), cell.v])),
  };
}

function cellValue(sheet: IndexedChartDataSheet, row: number, col: number): unknown {
  const value = sheet.cells.get(cellKey(row, col));
  return value?.v ?? value?.m ?? null;
}

function textValue(value: unknown): string {
  return value == null ? "" : String(value);
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function rangeValues(sheet: IndexedChartDataSheet, reference: RangeReference): unknown[] {
  const length = chartReferenceLength(reference);
  const vertical = reference.start.col === reference.end.col;
  return Array.from({ length }, (_, offset) =>
    cellValue(
      sheet,
      reference.start.row + (vertical ? offset : 0),
      reference.start.col + (vertical ? 0 : offset),
    ),
  );
}

function seriesName(
  sheetById: ReadonlyMap<string, IndexedChartDataSheet>,
  series: ChartSeriesSpec,
): string {
  if (typeof series.name === "string") return series.name;
  if (series.name) {
    const nameSheet = sheetById.get(series.name.sheetId);
    if (nameSheet) return textValue(rangeValues(nameSheet, series.name)[0]);
  }
  return series.id;
}

export function resolveChartData(
  chart: ChartSpec,
  sheets: readonly ChartDataSheet[],
): ChartData | null {
  const sheetById = new Map(sheets.map((sheet) => [sheet.id, indexSheet(sheet)]));
  const categories = chart.series[0]?.categoryRef
    ? (() => {
        const reference = chart.series[0].categoryRef;
        const sheet = sheetById.get(reference.sheetId);
        return sheet ? rangeValues(sheet, reference).map(textValue) : [];
      })()
    : [];

  const series = chart.series
    .map((item) => {
      const valueSheet = sheetById.get(item.valueRef.sheetId);
      return {
        id: item.id,
        name: seriesName(sheetById, item),
        data: valueSheet ? rangeValues(valueSheet, item.valueRef).map(numericValue) : [],
        chartType: item.chartType,
      };
    })
    // Text-only columns are not chart series. Keeping them here creates
    // misleading legends after a table range includes descriptive columns.
    .filter((item) => item.data.some((value) => value !== null));

  const length = Math.max(categories.length, ...series.map((item) => item.data.length), 0);
  if (length === 0) return null;
  return {
    categories:
      categories.length > 0 ? categories : Array.from({ length }, (_, index) => String(index + 1)),
    series,
  };
}

function cellAt(
  sheetById: ReadonlyMap<string, IndexedChartDataSheet>,
  reference: RangeReference,
  offset: number,
): FortuneCell | null {
  const sheet = sheetById.get(reference.sheetId);
  if (!sheet) return null;
  const vertical = reference.start.col === reference.end.col;
  const row = reference.start.row + (vertical ? offset : 0);
  const col = reference.start.col + (vertical ? 0 : offset);
  const value = sheet.cells.get(cellKey(row, col));
  return value == null ? null : ({ r: row, c: col, v: value } as FortuneCell);
}

function cellText(value: FortuneCell | null): string {
  const raw = value?.v?.v ?? value?.v?.m;
  return raw == null ? "" : String(raw);
}

export function inspectChartData(
  chart: ChartSpec,
  sheets: readonly ChartDataSheet[],
): ChartDataQuality {
  const sheetById = new Map(sheets.map((sheet) => [sheet.id, indexSheet(sheet)]));
  const categoryReference = chart.series[0]?.categoryRef;
  const categoryCount = categoryReference ? chartReferenceLength(categoryReference) : 0;
  const missingCategoryIndexes = categoryReference
    ? Array.from({ length: categoryCount }, (_, index) => index).filter(
        (index) => cellText(cellAt(sheetById, categoryReference, index)).trim() === "",
      )
    : [];

  return {
    categoryCount,
    missingCategoryIndexes,
    series: chart.series.map((item) => {
      const pointCount = chartReferenceLength(item.valueRef);
      const missingValueIndexes: number[] = [];
      const nonNumericValueIndexes: number[] = [];
      const formulaCells: string[] = [];
      const unresolvedFormulaCells: string[] = [];
      for (let index = 0; index < pointCount; index += 1) {
        const cell = cellAt(sheetById, item.valueRef, index);
        const rawValue = cell?.v?.v ?? cell?.v?.m;
        const numeric = numericValue(rawValue);
        if (numeric === null) {
          if (rawValue == null || (typeof rawValue === "string" && rawValue.trim() === "")) {
            missingValueIndexes.push(index);
          } else {
            nonNumericValueIndexes.push(index);
          }
        }
        if (cell?.v?.f) {
          const address = cellAddressToA1({ row: cell.r, col: cell.c });
          formulaCells.push(address);
          if (numeric === null) unresolvedFormulaCells.push(address);
        }
      }
      return {
        seriesId: item.id,
        name: seriesName(sheetById, item),
        pointCount,
        missingValueIndexes,
        nonNumericValueIndexes,
        formulaCells,
        unresolvedFormulaCells,
      };
    }),
  };
}
