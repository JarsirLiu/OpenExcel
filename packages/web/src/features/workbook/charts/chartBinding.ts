import type { ChartSpec } from "@openexcel/core";
import { normalizeSheetId, type SheetIdentity } from "../sheetIdentity";

export function chartsForSheet(charts: readonly ChartSpec[], sheetId: SheetIdentity): ChartSpec[] {
  const normalizedSheetId = normalizeSheetId(sheetId);
  return charts.filter((chart) => normalizeSheetId(chart.sheetId) === normalizedSheetId);
}
