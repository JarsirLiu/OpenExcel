import type { ChartSeriesSpec, ChartSpec, RangeReference } from "@openexcel/core";

export type FortuneSelection = {
  row: number[];
  column: number[];
};

export type ChartSelection = {
  startRow: number;
  endRow: number;
  startCol: number;
  endCol: number;
};

export type ChartDraft = Omit<ChartSpec, "id">;

export function normalizeChartSelection(
  selection: FortuneSelection | undefined,
): ChartSelection | null {
  if (!selection || selection.row.length < 2 || selection.column.length < 2) return null;

  const [startRow, endRow] = selection.row;
  const [startCol, endCol] = selection.column;
  if ([startRow, endRow, startCol, endCol].some((value) => !Number.isInteger(value))) {
    return null;
  }
  if (endRow <= startRow || endCol <= startCol) return null;

  return { startRow, endRow, startCol, endCol };
}

function verticalRange(
  sheetId: string,
  startRow: number,
  endRow: number,
  col: number,
): RangeReference {
  return {
    sheetId,
    start: { row: startRow, col },
    end: { row: endRow, col },
  };
}

function singleCellReference(sheetId: string, row: number, col: number): RangeReference {
  return verticalRange(sheetId, row, row, col);
}

function buildSeries(
  sheetId: string,
  selection: ChartSelection,
  type: ChartSpec["type"],
): ChartSeriesSpec[] {
  const categories = verticalRange(
    sheetId,
    selection.startRow + 1,
    selection.endRow,
    selection.startCol,
  );
  const series: ChartSeriesSpec[] = [];

  for (let col = selection.startCol + 1; col <= selection.endCol; col += 1) {
    series.push({
      id: `series-${col - selection.startCol}`,
      name: singleCellReference(sheetId, selection.startRow, col),
      categoryRef: categories,
      valueRef: verticalRange(sheetId, selection.startRow + 1, selection.endRow, col),
      ...(type === "combo" ? { chartType: "bar" as const } : {}),
    });
  }

  return type === "pie" ? series.slice(0, 1) : series;
}

export function buildChartDraft(input: {
  workbookId: number;
  sheetId: number;
  selection: ChartSelection;
  type: ChartSpec["type"];
  title?: string;
}): ChartDraft {
  const { selection } = input;
  const sheetId = String(input.sheetId);
  const series = buildSeries(sheetId, selection, input.type);
  if (series.length === 0) throw new Error("请选择至少两列数据");

  return {
    workbookId: String(input.workbookId),
    sheetId,
    type: input.type,
    ...(input.title?.trim() ? { title: input.title.trim() } : {}),
    anchor: {
      kind: "oneCell",
      from: { row: selection.startRow, col: selection.startCol },
      widthEmu: 3_809_999,
      heightEmu: 2_476_499,
    },
    series,
  };
}

export function chartSelectionSize(selection: ChartSelection | null): {
  rows: number;
  columns: number;
} {
  if (!selection) return { rows: 0, columns: 0 };
  return {
    rows: selection.endRow - selection.startRow + 1,
    columns: selection.endCol - selection.startCol + 1,
  };
}
