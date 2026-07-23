export type {
  ChartData,
  ChartDataSheet,
  ChartSeriesData,
} from "./chart/chartAnalysis.js";
export {
  chartDependencySheetIds,
  chartReferenceLength,
  resolveChartData,
} from "./chart/chartAnalysis.js";
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
export { CHART_PALETTE } from "./chart/chartPalette.js";
export { cellAddressToA1, rangeReferenceToA1 } from "./chart/chartReference.js";
export type {
  ChartComboSeriesType,
  ChartSourceRange,
  ChartSourceRangeKind,
} from "./chart/chartSource.js";
export {
  ChartSourceRangeError,
  chartSeriesFromSourceRange,
  chartSourceRangeKind,
} from "./chart/chartSource.js";
export {
  type ImportedChartMappingContext,
  ImportedChartMappingError,
  materializeImportedChart,
} from "./chart/importedChart.js";
export type {
  SheetChangeCell,
  SheetChangeClearCell,
  SheetChangeClearOperation,
  SheetChangeClearRange,
  SheetChangeDelta,
  SheetChangePatchOutput,
  SheetChangeRange,
  SheetChangeRangeOperation,
  SheetChangeSummary,
  SheetChangeVersion,
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
  sheetChangeSummarySchema,
  sheetChangeVersionSchema,
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
  toolColumnToA1Ref,
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
  ImportedChartInput,
  ImportedChartSeries,
  ImportedRangeReference,
  ImportedSheetInput,
  ImportedWorkbookBatchInput,
  ImportedWorkbookInput,
} from "./excel/workbookImport.js";
export { templateToExcel } from "./exporter/templateToExcel.js";
export type { ExcelSheetInput } from "./exporter/xlsxExportTypes.js";
export type { XlsxWorkbookInput } from "./exporter/xlsxWorkbookExporter.js";
export { workbookToXlsx } from "./exporter/xlsxWorkbookExporter.js";
export { formulaToR1C1 } from "./formula/formulaR1C1.js";
export { jsonToTemplate } from "./importer/jsonAnalyzer.js";
export {
  parseSpreadsheetFile,
  type SpreadsheetFileFormat,
  type SpreadsheetFileInput,
} from "./importer/spreadsheetFileImporter.js";
export type { XlsxChartImportLimits } from "./importer/xlsxChartImporter.js";
export {
  DEFAULT_XLSX_CHART_IMPORT_LIMITS,
  parseXlsxCharts,
  XlsxChartImportError,
} from "./importer/xlsxChartImporter.js";
export {
  assertXlsxContainerSafe,
  DEFAULT_XLSX_SAFETY_LIMITS,
  XlsxContainerError,
  XlsxSafetyLimitError,
  type XlsxSafetyLimits,
} from "./importer/xlsxSafetyGuard.js";
export { applySheetMutation } from "./sheet-sync/applySheetMutation.js";
export type {
  SheetCommand,
  SheetCommandBase,
  SheetCommandResult,
} from "./sheet-sync/sheetCommand.js";
export type { SheetMutation } from "./sheet-sync/sheetMutation.js";
export { sheetCommandSchema, sheetMutationSchema } from "./sheet-sync/sheetMutationSchema.js";
export type { SheetSnapshot } from "./sheet-sync/sheetSnapshot.js";
export { cloneSheetSnapshot } from "./sheet-sync/sheetSnapshot.js";
export type {
  SheetCellMatch,
  SheetCellQuery,
  SheetCellQueryOptions,
} from "./sheetTools/sheetCellQuery.js";
export { findSheetCells } from "./sheetTools/sheetCellQuery.js";
export type {
  FormulaException,
  FormulaPattern,
  SheetDataProjection,
  SheetDataProjectionOptions,
  SheetDataValue,
  SheetMerge,
  SheetToolRange,
} from "./sheetTools/sheetDataProjection.js";
export {
  parseSheetToolRange,
  projectSheetData,
  sheetUsedRange,
} from "./sheetTools/sheetDataProjection.js";
export type {
  SheetObjectSource,
  SheetObjectType,
} from "./sheetTools/sheetObjectProjection.js";
export {
  projectSheetObjects,
  UnsupportedSheetObjectTypeError,
} from "./sheetTools/sheetObjectProjection.js";
export type {
  SheetReadContinuation,
  SheetReadPage,
} from "./sheetTools/sheetReadPager.js";
export { planSheetReadPage, sheetToolRangeToA1 } from "./sheetTools/sheetReadPager.js";
export type {
  ColumnDef,
  InitConfig,
  MergeDef,
  SheetDef,
  Template,
  WorkbookDef,
} from "./types/index.js";
