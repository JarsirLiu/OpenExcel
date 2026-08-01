import { type ChartSpec, chartDependencySheetIds } from "@openexcel/core";
import type { SheetSchema } from "@/api/workbooks";

/** Selects only the sheets referenced by a chart before render-data resolution. */
export function selectChartSheets(chart: ChartSpec, sheets: readonly SheetSchema[]): SheetSchema[] {
  const dependencyIds = new Set(chartDependencySheetIds(chart));
  return sheets.filter((sheet) => dependencyIds.has(String(sheet.id)));
}
