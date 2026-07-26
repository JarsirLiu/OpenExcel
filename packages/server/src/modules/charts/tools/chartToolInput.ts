import {
  type ChartAnchor,
  type ChartSeriesSpec,
  type ChartSourceRange,
  chartSeriesFromSourceRange,
  type ExcelToolInput,
  type RangeReference,
} from "@openexcel/core";
import type { CreateChartInput, UpdateChartInput } from "../application/chartService.js";

type CreateChartToolInput = ExcelToolInput<"createChart">;
type UpdateChartToolPatch = ExcelToolInput<"updateChart">["patch"];
type ToolRange = CreateChartToolInput["sourceRange"];
type ToolAnchor = CreateChartToolInput["anchor"];
type ToolCell = NonNullable<ToolAnchor["from"]>;
type ToolSeries = NonNullable<UpdateChartToolPatch["series"]>[number];

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
  if (input.kind === "absolute") {
    return {
      kind: "absolute",
      xEmu: input.xEmu!,
      yEmu: input.yEmu!,
      widthEmu: input.widthEmu!,
      heightEmu: input.heightEmu!,
    };
  }
  if (input.kind === "oneCell") {
    return {
      kind: "oneCell",
      from: cell(input.from!),
      widthEmu: input.widthEmu!,
      heightEmu: input.heightEmu!,
    };
  }
  return { kind: "twoCell", from: cell(input.from!), to: cell(input.to!) };
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

export function toCreateChartSpec(input: CreateChartToolInput, id?: string): CreateChartInput {
  const sourceRange: ChartSourceRange = {
    sheetId: String(input.sourceRange.sheetId),
    start: { row: input.sourceRange.startRow - 1, col: input.sourceRange.startCol - 1 },
    end: { row: input.sourceRange.endRow - 1, col: input.sourceRange.endCol - 1 },
  };

  return {
    id,
    workbookId: String(input.workbookId),
    sheetId: String(input.sheetId),
    type: input.type,
    title: input.title,
    anchor: anchor(input.anchor),
    series: chartSeriesFromSourceRange(sourceRange, input.type, input.seriesTypes),
  };
}

export function toUpdateChartPatch(input: UpdateChartToolPatch): UpdateChartInput {
  return {
    type: input.type,
    title: input.title,
    sheetId: input.sheetId == null ? undefined : String(input.sheetId),
    anchor: input.anchor ? anchor(input.anchor) : undefined,
    series: input.series?.map(series),
  };
}
