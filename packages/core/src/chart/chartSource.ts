import type { ChartSeriesSpec, ChartSpec, RangeReference } from "./chartModel.js";

export type ChartSourceRange = {
  sheetId: string;
  start: { row: number; col: number };
  end: { row: number; col: number };
};

export type ChartSourceRangeKind = "row" | "column" | "table";
export type ChartComboSeriesType = "bar" | "line" | "area";

export class ChartSourceRangeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartSourceRangeError";
  }
}

function rangeReference(
  source: ChartSourceRange,
  start: { row: number; col: number },
  end: { row: number; col: number },
): RangeReference {
  return { sheetId: source.sheetId, start, end };
}

function assertValidSourceRange(source: ChartSourceRange) {
  const points = [source.start.row, source.start.col, source.end.row, source.end.col];
  if (
    points.some((value) => !Number.isInteger(value) || value < 0) ||
    source.sheetId.trim().length === 0
  ) {
    throw new ChartSourceRangeError("Chart source range is invalid");
  }
  if (source.end.row < source.start.row || source.end.col < source.start.col) {
    throw new ChartSourceRangeError("Chart source range must end at or after its start");
  }
}

export function chartSourceRangeKind(source: ChartSourceRange): ChartSourceRangeKind | null {
  assertValidSourceRange(source);
  const rows = source.end.row - source.start.row + 1;
  const columns = source.end.col - source.start.col + 1;
  if (rows === 1 && columns >= 2) return "row";
  if (columns === 1 && rows >= 2) return "column";
  if (rows >= 2 && columns >= 2) return "table";
  return null;
}

export function chartSeriesFromSourceRange(
  source: ChartSourceRange,
  type: ChartSpec["type"],
  seriesTypes?: readonly ChartComboSeriesType[],
): ChartSeriesSpec[] {
  const kind = chartSourceRangeKind(source);
  if (!kind) {
    throw new ChartSourceRangeError(
      "Chart source range must contain at least two cells in one row, one column, or a table",
    );
  }

  if (type === "pie" && (kind !== "table" || source.end.col - source.start.col + 1 !== 2)) {
    throw new ChartSourceRangeError("Pie charts require a two-column table: category and value");
  }
  if (type === "scatter" && kind !== "table") {
    throw new ChartSourceRangeError("Scatter charts require a table with an X column");
  }

  const seriesCount = kind === "table" ? source.end.col - source.start.col : 1;
  if (seriesTypes && type !== "combo") {
    throw new ChartSourceRangeError("Series types are only valid for combo charts");
  }
  if (seriesTypes && seriesTypes.length !== seriesCount) {
    throw new ChartSourceRangeError(
      `Combo charts require one series type for each generated series: expected ${seriesCount}`,
    );
  }
  const seriesType = (index: number) =>
    type === "combo" ? { chartType: seriesTypes?.[index] ?? ("bar" as const) } : {};
  if (kind === "row") {
    return [
      {
        id: "series-1",
        valueRef: rangeReference(source, source.start, source.end),
        ...seriesType(0),
      },
    ];
  }

  if (kind === "column") {
    return [
      {
        id: "series-1",
        valueRef: rangeReference(source, source.start, source.end),
        ...seriesType(0),
      },
    ];
  }

  const categories = rangeReference(
    source,
    { row: source.start.row + 1, col: source.start.col },
    { row: source.end.row, col: source.start.col },
  );
  const series: ChartSeriesSpec[] = [];
  for (let col = source.start.col + 1; col <= source.end.col; col += 1) {
    series.push({
      id: `series-${col - source.start.col}`,
      name: rangeReference(source, { row: source.start.row, col }, { row: source.start.row, col }),
      categoryRef: categories,
      valueRef: rangeReference(
        source,
        { row: source.start.row + 1, col },
        { row: source.end.row, col },
      ),
      ...seriesType(col - source.start.col - 1),
    });
  }

  return type === "pie" ? series.slice(0, 1) : series;
}
