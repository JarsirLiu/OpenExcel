import {
  type ChartData,
  type ChartSpec,
  type FortuneCell,
  resolveChartData,
} from "@openexcel/core";
import type { SheetSchema } from "@/api/workbooks";

export type ChartRenderData = ChartData;

export function buildChartRenderData(
  chart: ChartSpec,
  sheets: readonly SheetSchema[],
): ChartRenderData | null {
  return resolveChartData(
    chart,
    sheets.map((sheet) => ({
      id: String(sheet.id),
      celldata: (sheet.uploadedData ?? []) as FortuneCell[],
    })),
  );
}
