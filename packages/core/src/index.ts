export type { Template, SheetDef, ColumnDef, MergeDef } from "./types/index.js";
export type { WorkbookDef, InitConfig } from "./types/index.js";
export type { FortuneCell, FortuneCellValue } from "./excel/celldataUtils.js";
export { jsonToTemplate } from "./importer/jsonAnalyzer.js";
export { templateToExcel } from "./exporter/templateToExcel.js";
export { excelToGrid } from "./excel/excelToGrid.js";
export { celldataToGrid, gridToCelldata, isCelldata, matrixToCelldata } from "./excel/celldataUtils.js";
export type { SheetConfig, FortuneSheetData } from "./excel/sheetConfig.js";
export { extractSheetConfig, restoreSheetConfig } from "./excel/sheetConfig.js";
export {
  sheetChangeCellSchema,
  sheetChangeClearCellSchema,
  sheetChangeClearOperationSchema,
  sheetChangeClearRangeSchema,
  sheetChangeDeltaSchema,
  sheetChangePatchOutputSchema,
  sheetChangeRangeOperationSchema,
  sheetChangeRangeSchema,
} from "./chat/sheetChange.js";
export {
  sheetChangeCellToZeroBased,
  sheetChangeDeltaToZeroBased,
  sheetChangeRangeToZeroBased,
  toOneBasedIndex,
  toZeroBasedIndex,
  zeroBasedSheetChangeCellToSheetChangeCell,
  zeroBasedSheetChangeDeltaToSheetChangeDelta,
  zeroBasedSheetChangeRangeToSheetChangeRange,
} from "./chat/sheetCoordinates.js";
export type {
  SheetChangeCell,
  SheetChangeClearCell,
  SheetChangeClearOperation,
  SheetChangeClearRange,
  SheetChangeDelta,
  SheetChangePatchOutput,
  SheetChangeRangeOperation,
  SheetChangeRange,
} from "./chat/sheetChange.js";
export type {
  ZeroBasedSheetChangeCell,
  ZeroBasedSheetChangeClearOperation,
  ZeroBasedSheetChangeDelta,
  ZeroBasedSheetChangeRange,
} from "./chat/sheetCoordinates.js";
