export const DEFAULT_CHUNK_ROW_SIZE = 128;
export const DEFAULT_CHUNK_COLUMN_SIZE = 64;

export type DocumentCodec = "json-v1" | "json-gzip-v1";

export type DocumentScalar = string | number | boolean | null;

export interface DocumentCellValue {
  value: DocumentScalar;
  displayValue?: string;
  formula?: string;
  styleId?: string;
  metadata?: Record<string, unknown>;
}

export interface DocumentCell {
  row: number;
  col: number;
  value: DocumentCellValue;
}

export interface CellRange {
  startRow: number;
  startCol: number;
  endRow: number;
  endCol: number;
}

export interface DocumentChunk {
  rowBlock: number;
  colBlock: number;
  revision: number;
  codec: DocumentCodec;
  cells: Record<string, DocumentCellValue>;
}

export interface CreateChartOperation {
  type: "createObject";
  object: {
    id: string;
    type: "chart" | "image" | "comment" | "custom";
    position: Record<string, unknown>;
    data: Record<string, unknown>;
  };
}

export interface DocumentObjectPatch {
  position?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

export type DocumentOperation =
  | {
      type: "setCell";
      row: number;
      col: number;
      value: DocumentCellValue | null;
    }
  | {
      type: "setRangeValues";
      range: CellRange;
      values: DocumentScalar[][];
      formulas?: (string | null)[][];
    }
  | {
      type: "setRangeStyle";
      range: CellRange;
      styleId: string | null;
    }
  | {
      type: "clearRange";
      range: CellRange;
    }
  | CreateChartOperation
  | {
      type: "updateObject";
      id: string;
      patch: DocumentObjectPatch;
    }
  | {
      type: "deleteObject";
      id: string;
    }
  | {
      type: "replaceSnapshot";
      sourceFormat: string;
    };

export interface DocumentObject {
  id: string;
  type: "chart" | "image" | "comment" | "custom";
  position: Record<string, unknown>;
  data: Record<string, unknown>;
}
