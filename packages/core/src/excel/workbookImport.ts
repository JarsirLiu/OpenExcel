import type { ChartSeriesSpec, ChartSpec, RangeReference } from "../chart/chartModel.js";
import type { FortuneCell } from "./celldataUtils.js";
import type { SheetConfig } from "./sheetConfig.js";

export type ImportedRangeReference = Omit<RangeReference, "sheetId"> & { sheetKey: string };

export type ImportedChartSeries = Omit<ChartSeriesSpec, "categoryRef" | "valueRef" | "name"> & {
  name?: string | ImportedRangeReference;
  categoryRef?: ImportedRangeReference;
  valueRef: ImportedRangeReference;
};

export type ImportedChartInput = Omit<ChartSpec, "workbookId" | "sheetId" | "series"> & {
  sheetKey: string;
  series: ImportedChartSeries[];
};

/** 数据已经完成 Excel → FortuneSheet 转换后的工作簿导入 DTO。 */
export interface ImportedSheetInput {
  key: string;
  name: string;
  celldata: FortuneCell[];
  merges: { row: [number, number]; col: [number, number] }[];
  config: SheetConfig;
}

export interface ImportedWorkbookInput {
  name: string;
  sheets: ImportedSheetInput[];
  charts: ImportedChartInput[];
}

export interface ImportedWorkbookBatchInput {
  workbooks: ImportedWorkbookInput[];
}
