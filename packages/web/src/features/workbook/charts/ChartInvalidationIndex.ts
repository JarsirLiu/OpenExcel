import type { ChartSpec, RangeReference } from "@openexcel/core";
import type { WorkbookDocumentChange } from "@/features/workspace/WorkbookDocumentStore";

function normalizedId(value: string | number): string {
  return String(value);
}

function referenceContains(reference: RangeReference, row: number, col: number): boolean {
  return (
    row >= reference.start.row &&
    row <= reference.end.row &&
    col >= reference.start.col &&
    col <= reference.end.col
  );
}

function chartReferences(chart: ChartSpec): RangeReference[] {
  return chart.series.flatMap((series) => [
    series.valueRef,
    ...(series.categoryRef ? [series.categoryRef] : []),
    ...(typeof series.name === "object" ? [series.name] : []),
  ]);
}

export function chartAffectsChange(chart: ChartSpec, change: WorkbookDocumentChange): boolean {
  if (change.kind === "workbook" || change.structural) return true;
  return chartReferences(chart).some(
    (reference) =>
      normalizedId(reference.sheetId) === normalizedId(change.sheetId) &&
      change.cells.some(({ row, col }) => referenceContains(reference, row, col)),
  );
}
