import {
  type CellRange,
  DEFAULT_CHUNK_COLUMN_SIZE,
  DEFAULT_CHUNK_ROW_SIZE,
  type DocumentCellValue,
  type DocumentChunk,
} from "./model.js";

export interface ChunkOptions {
  rowSize?: number;
  columnSize?: number;
}

export interface ChunkPosition {
  rowBlock: number;
  colBlock: number;
  rowOffset: number;
  colOffset: number;
}

export function getChunkPosition(
  row: number,
  col: number,
  options: ChunkOptions = {},
): ChunkPosition {
  const rowSize = options.rowSize ?? DEFAULT_CHUNK_ROW_SIZE;
  const columnSize = options.columnSize ?? DEFAULT_CHUNK_COLUMN_SIZE;
  if (!Number.isInteger(row) || row < 0 || !Number.isInteger(col) || col < 0) {
    throw new Error("Cell coordinates must be non-negative integers");
  }
  if (rowSize <= 0 || columnSize <= 0) {
    throw new Error("Chunk dimensions must be positive");
  }

  return {
    rowBlock: Math.floor(row / rowSize),
    colBlock: Math.floor(col / columnSize),
    rowOffset: row % rowSize,
    colOffset: col % columnSize,
  };
}

export function getChunkKey(rowBlock: number, colBlock: number): string {
  return `${rowBlock}:${colBlock}`;
}

export function getChunkRange(
  rowBlock: number,
  colBlock: number,
  options: ChunkOptions = {},
): CellRange {
  const rowSize = options.rowSize ?? DEFAULT_CHUNK_ROW_SIZE;
  const columnSize = options.columnSize ?? DEFAULT_CHUNK_COLUMN_SIZE;
  if (!Number.isInteger(rowBlock) || rowBlock < 0 || !Number.isInteger(colBlock) || colBlock < 0) {
    throw new Error("Chunk coordinates must be non-negative integers");
  }
  return {
    startRow: rowBlock * rowSize,
    startCol: colBlock * columnSize,
    endRow: (rowBlock + 1) * rowSize - 1,
    endCol: (colBlock + 1) * columnSize - 1,
  };
}

export function createEmptyChunk(rowBlock: number, colBlock: number, revision = 0): DocumentChunk {
  return {
    rowBlock,
    colBlock,
    revision,
    codec: "json-v1",
    cells: {},
  };
}

export function getChunkCellKey(rowOffset: number, colOffset: number): string {
  return `${rowOffset},${colOffset}`;
}

export function readChunkCell(
  chunk: DocumentChunk | undefined,
  row: number,
  col: number,
  options: ChunkOptions = {},
): DocumentCellValue | null {
  if (!chunk) return null;
  const position = getChunkPosition(row, col, options);
  return chunk.cells[getChunkCellKey(position.rowOffset, position.colOffset)] ?? null;
}

export function writeChunkCell(
  chunk: DocumentChunk,
  row: number,
  col: number,
  value: DocumentCellValue | null,
  options: ChunkOptions = {},
): DocumentChunk {
  const position = getChunkPosition(row, col, options);
  const next: DocumentChunk = { ...chunk, cells: { ...chunk.cells } };
  const key = getChunkCellKey(position.rowOffset, position.colOffset);
  if (value == null) {
    delete next.cells[key];
  } else {
    next.cells[key] = value;
  }
  return next;
}
