import type { FortuneCell } from "../excel/celldataUtils.js";
import type { ChartSeriesSpec, ChartSpec, RangeReference } from "./chartModel.js";

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
  cells: ReadonlyMap<string, unknown>;
};

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function indexSheet(sheet: ChartDataSheet): IndexedChartDataSheet {
  return {
    id: sheet.id,
    cells: new Map(
      sheet.celldata.map((cell) => [cellKey(cell.r, cell.c), cell.v?.v ?? cell.v?.m ?? null]),
    ),
  };
}

function cellValue(sheet: IndexedChartDataSheet, row: number, col: number): unknown {
  return sheet.cells.get(cellKey(row, col)) ?? null;
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

  const series = chart.series.map((item) => {
    const valueSheet = sheetById.get(item.valueRef.sheetId);
    return {
      id: item.id,
      name: seriesName(sheetById, item),
      data: valueSheet ? rangeValues(valueSheet, item.valueRef).map(numericValue) : [],
      chartType: item.chartType,
    };
  });

  const length = Math.max(categories.length, ...series.map((item) => item.data.length), 0);
  if (length === 0) return null;
  return {
    categories:
      categories.length > 0 ? categories : Array.from({ length }, (_, index) => String(index + 1)),
    series,
  };
}
