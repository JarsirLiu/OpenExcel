export type { Template, SheetDef, ColumnDef, MergeDef } from "./types/index.js";
export type { WorkbookDef, InitConfig } from "./types/index.js";
export type { FortuneCell, FortuneCellValue } from "./mapper/celldataUtils.js";
export { jsonToTemplate } from "./analyzer/jsonAnalyzer.js";
export { templateToExcel } from "./generator/templateToExcel.js";
export { excelToGrid } from "./mapper/excelToGrid.js";
export { celldataToGrid, gridToCelldata, isCelldata, matrixToCelldata } from "./mapper/celldataUtils.js";
export type { SheetConfig, FortuneSheetData } from "./mapper/sheetConfig.js";
export { extractSheetConfig, restoreSheetConfig } from "./mapper/sheetConfig.js";
