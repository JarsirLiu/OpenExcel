import type { FortuneCell } from "./celldataUtils.js";
import type { SheetConfig } from "./sheetConfig.js";

/** 数据已经完成 Excel → FortuneSheet 转换后的工作簿导入 DTO。 */
export interface ImportedSheetInput {
  name: string;
  celldata: FortuneCell[];
  merges: { row: [number, number]; col: [number, number] }[];
  config: SheetConfig;
}

export interface ImportedWorkbookInput {
  name: string;
  sheets: ImportedSheetInput[];
}

export interface ImportedWorkbookBatchInput {
  workbooks: ImportedWorkbookInput[];
}
