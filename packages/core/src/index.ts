export type { ChartCommand, ChartCommandResult, ChartUpdate } from "./chart/chartCommands.js";
export {
  applyChartCommand,
  ChartCommandError,
} from "./chart/chartCommands.js";
export type {
  CellAddress,
  ChartAnchor,
  ChartAnchorPoint,
  ChartSeriesName,
  ChartSeriesSpec,
  ChartSpec,
  RangeReference,
} from "./chart/chartModel.js";
export {
  chartSpecSchema,
  isChartSpec,
  parseChartSpec,
} from "./chart/chartModel.js";
export { cellAddressToA1, rangeReferenceToA1 } from "./chart/chartReference.js";
export type {
  SheetChangeCell,
  SheetChangeClearCell,
  SheetChangeClearOperation,
  SheetChangeClearRange,
  SheetChangeDelta,
  SheetChangePatchOutput,
  SheetChangeRange,
  SheetChangeRangeOperation,
} from "./chat/sheetChange.js";
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
export type {
  StorageIndex,
  StorageRange,
  ToolIndex,
  ToolRange,
  ZeroBasedSheetChangeCell,
  ZeroBasedSheetChangeClearOperation,
  ZeroBasedSheetChangeDelta,
  ZeroBasedSheetChangeRange,
} from "./chat/sheetCoordinates.js";
export {
  sheetChangeCellToZeroBased,
  sheetChangeDeltaToZeroBased,
  sheetChangeRangeToZeroBased,
  storageIndex,
  storageIndexToTool,
  storageRangeToTool,
  toolIndex,
  toolIndexToStorage,
  toolRangeToStorage,
  zeroBasedSheetChangeCellToSheetChangeCell,
  zeroBasedSheetChangeDeltaToSheetChangeDelta,
  zeroBasedSheetChangeRangeToSheetChangeRange,
} from "./chat/sheetCoordinates.js";
export {
  fortuneMergesToToolRanges,
  toolCellToA1Ref,
  toolRangeToA1Ref,
} from "./chat/sheetGeometry.js";
export type { FortuneCell, FortuneCellValue } from "./excel/celldataUtils.js";
export {
  celldataToGrid,
  DEFAULT_FORTUNE_FONT_COLOR,
  extractMergesFromCelldata,
  gridToCelldata,
  isCelldata,
  matrixToCelldata,
  normalizeFortuneCellData,
} from "./excel/celldataUtils.js";
export {
  excelAutoFilterRefToFortune,
  fortuneFilterSelectionToExcelRef,
  isFilterSelection,
} from "./excel/excelFilter.js";
export type {
  FortuneCellNormalizationOptions,
  FortuneCellScalar,
} from "./excel/fortuneCellValue.js";
export {
  displayValueOfFortuneScalar,
  fortuneCellValueToScalar,
  normalizeFortuneCellValue,
  normalizeFortuneFormula,
} from "./excel/fortuneCellValue.js";
export type { ExcelColorInput } from "./excel/fortuneStyle.js";
export {
  excelBorderStyleToFortune,
  excelColorToFortune,
  excelHorizontalToFortune,
  excelVerticalToFortune,
  excelWrapToFortune,
  fortuneBorderStyleToExcel,
  fortuneColorToArgb,
  fortuneHorizontalToExcel,
  fortuneVerticalToExcel,
  fortuneWrapToExcel,
} from "./excel/fortuneStyle.js";
export { type JsonValue, toJsonObject, toJsonValue } from "./excel/jsonValue.js";
export type { FilterSelection, FortuneSheetData, SheetConfig } from "./excel/sheetConfig.js";
export { extractSheetConfig, restoreSheetConfig } from "./excel/sheetConfig.js";
export type {
  ImportedSheetInput,
  ImportedWorkbookBatchInput,
  ImportedWorkbookInput,
} from "./excel/workbookImport.js";
export { celldataToExcel } from "./exporter/celldataToExcel.js";
export { templateToExcel } from "./exporter/templateToExcel.js";
export { jsonToTemplate } from "./importer/jsonAnalyzer.js";
export {
  parseSpreadsheetFile,
  type SpreadsheetFileFormat,
  type SpreadsheetFileInput,
} from "./importer/spreadsheetFileImporter.js";
export {
  assertXlsxContainerSafe,
  DEFAULT_XLSX_SAFETY_LIMITS,
  XlsxContainerError,
  XlsxSafetyLimitError,
  type XlsxSafetyLimits,
} from "./importer/xlsxSafetyGuard.js";
export type {
  ColumnDef,
  InitConfig,
  MergeDef,
  SheetDef,
  Template,
  WorkbookDef,
} from "./types/index.js";
