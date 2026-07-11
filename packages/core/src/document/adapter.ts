import type { CellRange, DocumentCell, DocumentObject, DocumentOperation } from "./model.js";

export interface DocumentRange {
  sheetId: number;
  range: CellRange;
}

export interface DocumentRangeData extends DocumentRange {
  revision: number;
  cells: DocumentCell[];
}

export interface DocumentMutationResult {
  revision: number;
  changedRanges: CellRange[];
  objectIds: string[];
}

export interface DocumentAdapter {
  readRange(input: DocumentRange): Promise<DocumentRangeData>;
  applyOperation(sheetId: number, operation: DocumentOperation): Promise<DocumentMutationResult>;
  listObjects(sheetId: number): Promise<DocumentObject[]>;
}
