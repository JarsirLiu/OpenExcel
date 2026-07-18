import type { ImportedChartInput, ImportedRangeReference } from "../excel/workbookImport.js";
import { type ChartSpec, parseChartSpec } from "./chartModel.js";

export class ImportedChartMappingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImportedChartMappingError";
  }
}

export interface ImportedChartMappingContext {
  workbookId: string;
  chartId: string;
  sheetIdByKey: ReadonlyMap<string, string>;
}

function mapReference(
  reference: ImportedRangeReference,
  sheetIdByKey: ReadonlyMap<string, string>,
) {
  const sheetId = sheetIdByKey.get(reference.sheetKey);
  if (!sheetId) {
    throw new ImportedChartMappingError(`图表引用了未知的导入 Sheet：${reference.sheetKey}`);
  }
  return { sheetId, start: reference.start, end: reference.end };
}

export function materializeImportedChart(
  input: ImportedChartInput,
  context: ImportedChartMappingContext,
): ChartSpec {
  const sheetId = context.sheetIdByKey.get(input.sheetKey);
  if (!sheetId) {
    throw new ImportedChartMappingError(`图表锚定了未知的导入 Sheet：${input.sheetKey}`);
  }

  return parseChartSpec({
    id: context.chartId,
    workbookId: context.workbookId,
    sheetId,
    type: input.type,
    title: input.title,
    anchor: input.anchor,
    series: input.series.map((series) => ({
      id: series.id,
      name:
        typeof series.name === "object"
          ? mapReference(series.name, context.sheetIdByKey)
          : series.name,
      categoryRef: series.categoryRef
        ? mapReference(series.categoryRef, context.sheetIdByKey)
        : undefined,
      valueRef: mapReference(series.valueRef, context.sheetIdByKey),
      chartType: series.chartType,
    })),
  });
}
