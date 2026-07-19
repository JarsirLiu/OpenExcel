import { type ChartSourceRange, type ChartSpec, chartSeriesFromSourceRange } from "@openexcel/core";

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

  const sourceRange: ChartSourceRange = {
    sheetId: String(input.sheetId),
    start: { row: selection.startRow, col: selection.startCol },
    end: { row: selection.endRow, col: selection.endCol },
  };
  const sheetId = sourceRange.sheetId;
  const series = chartSeriesFromSourceRange(sourceRange, input.type);

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
