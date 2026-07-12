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
  ZeroBasedSheetChangeCell,
  ZeroBasedSheetChangeClearOperation,
  ZeroBasedSheetChangeDelta,
  ZeroBasedSheetChangeRange,
} from "./chat/sheetCoordinates.js";
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
  DocumentAdapter,
  DocumentMutationResult,
  DocumentRange,
  DocumentRangeData,
} from "./document/adapter.js";
export {
  createEmptyChunk,
  getChunkCellKey,
  getChunkKey,
  getChunkPosition,
  getChunkRange,
  readChunkCell,
  writeChunkCell,
} from "./document/chunk.js";
export type { FormulaReference } from "./document/formula.js";
export { extractFormulaReferences } from "./document/formula.js";
export {
  chunksToFortuneCelldata,
  documentValueToFortuneValue,
  fortuneCelldataToChunks,
  fortuneCellToDocumentValue,
} from "./document/fortuneAdapter.js";
export {
  type CellRange,
  type CreateChartOperation,
  DEFAULT_CHUNK_COLUMN_SIZE,
  DEFAULT_CHUNK_ROW_SIZE,
  type DocumentCell,
  type DocumentCellValue,
  type DocumentChunk,
  type DocumentObject,
  type DocumentObjectPatch,
  type DocumentOperation,
  type DocumentScalar,
} from "./document/model.js";
export {
  applyDocumentOperation,
  applyDocumentOperations,
  createDocumentState,
  type DocumentState,
  readDocumentCell,
} from "./document/operations.js";
export {
  cellRangeSize,
  formatA1Cell,
  formatA1Range,
  parseA1Cell,
  parseA1Range,
  validateCellRange,
} from "./document/range.js";
export { decodeDocumentJson, encodeDocumentJson } from "./document/serialization.js";
export type { FortuneCell, FortuneCellValue } from "./excel/celldataUtils.js";
export {
  celldataToGrid,
  gridToCelldata,
  isCelldata,
  matrixToCelldata,
} from "./excel/celldataUtils.js";
export { excelToGrid } from "./excel/excelToGrid.js";
export type { FortuneSheetData, SheetConfig } from "./excel/sheetConfig.js";
export { extractSheetConfig, restoreSheetConfig } from "./excel/sheetConfig.js";
export { celldataToExcel } from "./exporter/celldataToExcel.js";
export { templateToExcel } from "./exporter/templateToExcel.js";
export { jsonToTemplate } from "./importer/jsonAnalyzer.js";
export type {
  ColumnDef,
  InitConfig,
  MergeDef,
  SheetDef,
  Template,
  WorkbookDef,
} from "./types/index.js";
