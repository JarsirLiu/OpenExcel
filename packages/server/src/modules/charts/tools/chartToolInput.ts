import type { ChartAnchor, ChartSeriesSpec, ChartSpec, RangeReference } from "@openexcel/core";
import type { CreateChartInput, UpdateChartInput } from "../application/chartService.js";

type ToolCell = { row: number; col: number };
type ToolRange = {
  sheetId: number;
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
};
type ToolAnchor =
  | {
      kind: "oneCell";
      from: ToolCell;
      widthEmu: number;
      heightEmu: number;
    }
  | { kind: "twoCell"; from: ToolCell; to: ToolCell }
  | {
      kind: "absolute";
      xEmu: number;
      yEmu: number;
      widthEmu: number;
      heightEmu: number;
    };
type ToolSeries = {
  id: string;
  name?: string;
  categoryRef?: ToolRange;
  valueRef: ToolRange;
  chartType?: NonNullable<ChartSeriesSpec["chartType"]>;
};

function cell(cell: ToolCell) {
  return { row: cell.row - 1, col: cell.col - 1 };
}

function range(reference: ToolRange): RangeReference {
  return {
    sheetId: String(reference.sheetId),
    start: { row: reference.startRow - 1, col: reference.startCol - 1 },
    end: { row: reference.endRow - 1, col: reference.endCol - 1 },
  };
}

function anchor(input: ToolAnchor): ChartAnchor {
  if (input.kind === "absolute") return input;
  if (input.kind === "oneCell") {
    return { ...input, from: cell(input.from) };
  }
  return { ...input, from: cell(input.from), to: cell(input.to) };
}

function series(input: ToolSeries): ChartSeriesSpec {
  return {
    id: input.id,
    name: input.name,
    categoryRef: input.categoryRef ? range(input.categoryRef) : undefined,
    valueRef: range(input.valueRef),
    chartType: input.chartType,
  };
}

export function toCreateChartSpec(
  input: {
    workbookId: number;
    sheetId: number;
    type: ChartSpec["type"];
    title?: string;
    anchor: ToolAnchor;
    series: ToolSeries[];
  },
  id?: string,
): CreateChartInput {
  return {
    id,
    workbookId: String(input.workbookId),
    sheetId: String(input.sheetId),
    type: input.type,
    title: input.title,
    anchor: anchor(input.anchor),
    series: input.series.map(series),
  };
}

export function toUpdateChartPatch(input: {
  type?: ChartSpec["type"];
  title?: string | null;
  sheetId?: number;
  anchor?: ToolAnchor;
  series?: ToolSeries[];
}): UpdateChartInput {
  return {
    type: input.type,
    title: input.title,
    sheetId: input.sheetId == null ? undefined : String(input.sheetId),
    anchor: input.anchor ? anchor(input.anchor) : undefined,
    series: input.series?.map(series),
  };
}
