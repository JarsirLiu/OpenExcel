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

export type ChartSelectionKind = "table" | "row" | "column";

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
  if (endRow < startRow || endCol < startCol) return null;

  const normalized = { startRow, endRow, startCol, endCol };
  return chartSelectionKind(normalized) ? normalized : null;
}

export function chartSelectionKind(selection: ChartSelection | null): ChartSelectionKind | null {
  if (!selection) return null;

  const rows = selection.endRow - selection.startRow + 1;
  const columns = selection.endCol - selection.startCol + 1;
  if (rows === 1 && columns >= 2) return "row";
  if (columns === 1 && rows >= 2) return "column";
  if (rows >= 2 && columns >= 2) return "table";
  return null;
}

export function chartSelectionError(
  selection: ChartSelection | null,
  type: ChartSpec["type"],
): string | null {
  if (!selection) return "请选择至少两个横向或纵向单元格，或一个包含分类列的二维数据区域";

  const kind = chartSelectionKind(selection);
  if (!kind) return "请选择至少两个横向或纵向单元格，或一个包含分类列的二维数据区域";
  if (type === "pie" && (kind !== "table" || selection.endCol - selection.startCol + 1 !== 2)) {
    return "饼图需要两列数据：第一列为分类，第二列为数值";
  }
  if (type === "scatter" && kind !== "table") {
    return "散点图需要二维数据：第一列为 X 值，后续列为 Y 值";
  }
  return null;
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

function horizontalRange(
  sheetId: string,
  row: number,
  startCol: number,
  endCol: number,
): RangeReference {
  return {
    sheetId,
    start: { row, col: startCol },
    end: { row, col: endCol },
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
  const kind = chartSelectionKind(selection);
  if (kind === "row") {
    return [
      {
        id: "series-1",
        valueRef: horizontalRange(
          sheetId,
          selection.startRow,
          selection.startCol,
          selection.endCol,
        ),
        ...(type === "combo" ? { chartType: "bar" as const } : {}),
      },
    ];
  }
  if (kind === "column") {
    return [
      {
        id: "series-1",
        valueRef: verticalRange(sheetId, selection.startRow, selection.endRow, selection.startCol),
        ...(type === "combo" ? { chartType: "bar" as const } : {}),
      },
    ];
  }

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
  const selectionError = chartSelectionError(selection, input.type);
  if (selectionError) throw new Error(selectionError);

  const sheetId = String(input.sheetId);
  const series = buildSeries(sheetId, selection, input.type);

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
