import type { ChartDataQuality, ChartSeriesDataQuality } from "@openexcel/core";

type ChartMutationRecord = {
  publicId?: unknown;
  workbookId?: unknown;
  sheetId?: unknown;
};

const MAX_DIAGNOSTIC_SERIES = 20;
const MAX_DIAGNOSTIC_INDEXES = 20;

type BoundedSeriesQuality = Omit<
  ChartSeriesDataQuality,
  "missingValueIndexes" | "nonNumericValueIndexes" | "formulaCells" | "unresolvedFormulaCells"
> & {
  missingValueIndexes: number[];
  nonNumericValueIndexes: number[];
  formulaCells: string[];
  unresolvedFormulaCells: string[];
  indexesTruncated?: boolean;
};

export type BoundedChartDataQuality = {
  categoryCount: number;
  missingCategoryIndexes: number[];
  missingCategoryIndexesTruncated?: boolean;
  series: BoundedSeriesQuality[];
  seriesCount: number;
  seriesTruncated?: boolean;
};

export type CreateChartToolResult = {
  success: true;
  chartId: string;
  workbookId: number;
  sheetId: number;
  dataQuality?: BoundedChartDataQuality;
};

export type UpdateChartToolResult = {
  success: true;
  chartId: string;
};

function asRecord(value: unknown): ChartMutationRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("Chart mutation returned an invalid persistence result");
  }
  return value as ChartMutationRecord;
}

function asPositiveInteger(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    throw new Error(`Chart mutation returned an invalid ${field}`);
  }
  return value;
}

export function toCreateChartToolResult(
  value: unknown,
  dataQuality?: ChartDataQuality,
): CreateChartToolResult {
  const result = asRecord(value);
  if (typeof result.publicId !== "string" || result.publicId.length === 0) {
    throw new Error("Chart mutation returned an invalid chart id");
  }

  return {
    success: true,
    chartId: result.publicId,
    workbookId: asPositiveInteger(result.workbookId, "workbook id"),
    sheetId: asPositiveInteger(result.sheetId, "sheet id"),
    ...(dataQuality ? { dataQuality: summarizeChartDataQuality(dataQuality) } : {}),
  };
}

function boundedValues<T>(values: readonly T[]) {
  return values.slice(0, MAX_DIAGNOSTIC_INDEXES);
}

function summarizeChartDataQuality(dataQuality: ChartDataQuality): BoundedChartDataQuality {
  const series = dataQuality.series.slice(0, MAX_DIAGNOSTIC_SERIES).map((item) => ({
    ...item,
    missingValueIndexes: boundedValues(item.missingValueIndexes),
    nonNumericValueIndexes: boundedValues(item.nonNumericValueIndexes),
    formulaCells: boundedValues(item.formulaCells),
    unresolvedFormulaCells: boundedValues(item.unresolvedFormulaCells),
    ...(item.missingValueIndexes.length > MAX_DIAGNOSTIC_INDEXES ||
    item.nonNumericValueIndexes.length > MAX_DIAGNOSTIC_INDEXES ||
    item.formulaCells.length > MAX_DIAGNOSTIC_INDEXES ||
    item.unresolvedFormulaCells.length > MAX_DIAGNOSTIC_INDEXES
      ? { indexesTruncated: true }
      : {}),
  }));

  return {
    categoryCount: dataQuality.categoryCount,
    missingCategoryIndexes: boundedValues(dataQuality.missingCategoryIndexes),
    ...(dataQuality.missingCategoryIndexes.length > MAX_DIAGNOSTIC_INDEXES
      ? { missingCategoryIndexesTruncated: true }
      : {}),
    series,
    seriesCount: dataQuality.series.length,
    ...(dataQuality.series.length > MAX_DIAGNOSTIC_SERIES ? { seriesTruncated: true } : {}),
  };
}

export function toUpdateChartToolResult(value: unknown, chartId: string): UpdateChartToolResult {
  const result = asRecord(value);
  return {
    success: true,
    chartId: typeof result.publicId === "string" ? result.publicId : chartId,
  };
}
