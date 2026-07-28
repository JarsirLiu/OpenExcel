import type { ChartSpec, FortuneCell } from "@openexcel/core";
import { parseChartSpec } from "@openexcel/core";
import { ChartValidationError } from "./chart.js";

function cellKey(row: number, col: number): string {
  return `${row}:${col}`;
}

function numericValue(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export type ChartDataSheet = {
  id: string;
  celldata: readonly FortuneCell[];
};

function rangeValues(
  cellsBySheet: ReadonlyMap<string, ReadonlyMap<string, unknown>>,
  chart: ChartSpec,
  seriesIndex: number,
) {
  const reference = chart.series[seriesIndex]?.valueRef;
  if (!reference) return [];
  const cells = cellsBySheet.get(reference.sheetId);
  if (!cells) return [];
  const vertical = reference.start.col === reference.end.col;
  const length =
    Math.max(reference.end.row - reference.start.row, reference.end.col - reference.start.col) + 1;
  return Array.from({ length }, (_, offset) =>
    cells.get(
      cellKey(
        reference.start.row + (vertical ? offset : 0),
        reference.start.col + (vertical ? 0 : offset),
      ),
    ),
  );
}

/** Removes source-range columns that cannot produce any numeric chart values. */
export function normalizeChartSpecForCellData(
  spec: ChartSpec,
  celldata: readonly FortuneCell[],
): ChartSpec {
  return normalizeChartSpecForSheets(spec, [{ id: spec.sheetId, celldata }]);
}

/**
 * Validates chart series against the current workbook data and removes
 * references that cannot produce a numeric series.
 */
export function normalizeChartSpecForSheets(
  spec: ChartSpec,
  sheets: readonly ChartDataSheet[],
): ChartSpec {
  const cellsBySheet = new Map(
    sheets.map((sheet) => [
      sheet.id,
      new Map(
        sheet.celldata.map((cell) => [cellKey(cell.r, cell.c), cell.v?.v ?? cell.v?.m ?? null]),
      ),
    ]),
  );
  const series = spec.series.filter((_, index) =>
    rangeValues(cellsBySheet, spec, index).some((value) => numericValue(value) !== null),
  );

  if (series.length === 0) {
    throw new ChartValidationError("图表数据范围中没有可绘制的数值列");
  }

  return parseChartSpec({ ...spec, series });
}
