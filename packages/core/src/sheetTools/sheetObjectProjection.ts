import type { ChartSpec } from "../chart/chartModel.js";
import { cellAddressToA1, rangeReferenceToA1 } from "../chart/chartReference.js";
import type { FilterSelection, SheetConfig } from "../excel/sheetConfig.js";

export type SheetObjectType = "charts" | "filters" | "tables" | "pivotTables";

export class UnsupportedSheetObjectTypeError extends Error {
  constructor(public readonly objectType: "tables" | "pivotTables") {
    super(`Sheet object type ${objectType} is not modeled`);
    this.name = "UnsupportedSheetObjectTypeError";
  }
}

export type SheetObjectSource = {
  sheetId: string;
  sheetName: string;
  sheetNames: ReadonlyMap<string, string>;
  config: SheetConfig | null;
  charts: readonly ChartSpec[];
};

function referenceA1(
  source: SheetObjectSource,
  sheetId: string,
  reference: Parameters<typeof rangeReferenceToA1>[0],
): string {
  return rangeReferenceToA1(reference, source.sheetNames.get(sheetId) ?? sheetId);
}

function filterRange(selection: FilterSelection | undefined): string | null {
  if (!selection) return null;
  const start = cellAddressToA1({ row: selection.row[0], col: selection.column[0] });
  const end = cellAddressToA1({ row: selection.row[1], col: selection.column[1] });
  return start === end ? start : `${start}:${end}`;
}

function chartAnchor(chart: ChartSpec): string {
  if (chart.anchor.kind === "twoCell") {
    const start = cellAddressToA1(chart.anchor.from);
    const end = cellAddressToA1(chart.anchor.to);
    return start === end ? start : `${start}:${end}`;
  }
  if (chart.anchor.kind === "oneCell") return cellAddressToA1(chart.anchor.from);
  return `absolute(${chart.anchor.xEmu},${chart.anchor.yEmu},${chart.anchor.widthEmu},${chart.anchor.heightEmu})`;
}

function projectCharts(source: SheetObjectSource) {
  return source.charts
    .filter((chart) => chart.sheetId === source.sheetId)
    .map((chart) => ({
      kind: "chart" as const,
      id: chart.id,
      type: chart.type,
      title: chart.title ?? null,
      anchor: chartAnchor(chart),
      series: chart.series.map((series) => ({
        id: series.id,
        name:
          typeof series.name === "string"
            ? series.name
            : series.name
              ? referenceA1(source, series.name.sheetId, series.name)
              : null,
        categoryRange: series.categoryRef
          ? referenceA1(source, series.categoryRef.sheetId, series.categoryRef)
          : null,
        valueRange: referenceA1(source, series.valueRef.sheetId, series.valueRef),
        chartType: series.chartType ?? null,
      })),
    }));
}

function projectFilters(source: SheetObjectSource) {
  const selection = source.config?.filter_select;
  const range = filterRange(selection);
  return range ? [{ kind: "filter" as const, range }] : [];
}

export function projectSheetObjects(source: SheetObjectSource, objectType: SheetObjectType) {
  switch (objectType) {
    case "charts":
      return projectCharts(source);
    case "filters":
      return projectFilters(source);
    case "tables":
      throw new UnsupportedSheetObjectTypeError("tables");
    case "pivotTables":
      throw new UnsupportedSheetObjectTypeError("pivotTables");
  }
}
