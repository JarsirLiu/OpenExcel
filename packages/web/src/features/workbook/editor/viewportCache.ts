import {
  type CellRange,
  DEFAULT_CHUNK_COLUMN_SIZE,
  DEFAULT_CHUNK_ROW_SIZE,
  documentValueToFortuneValue,
  type FortuneCell,
  formatA1Range,
  getChunkKey,
  getChunkPosition,
} from "@openexcel/core";
import type { DocumentRangeResult } from "@/api/documents";

const DEFAULT_ROW_HEIGHT = 19;
const DEFAULT_COLUMN_WIDTH = 100;
const VIEWPORT_ROWS = 64;
const VIEWPORT_COLUMNS = 16;
const PREFETCH_ROWS = 32;
const PREFETCH_COLUMNS = 8;

type MergeObject = DocumentRangeResult["objects"][number];

export type ViewportCacheState = {
  cells: Map<string, FortuneCell>;
  headers: Map<number, FortuneCell>;
  mergeObjects: Map<string, MergeObject>;
  loadedChunks: Set<string>;
  revision: number;
  maxRow: number;
  maxColumn: number;
};

export function createViewportCache(): ViewportCacheState {
  return {
    cells: new Map(),
    headers: new Map(),
    mergeObjects: new Map(),
    loadedChunks: new Set(),
    revision: 0,
    maxRow: 0,
    maxColumn: 0,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, max));
}

export function expandRangeToChunks(range: CellRange): CellRange {
  const first = getChunkPosition(range.startRow, range.startCol);
  const last = getChunkPosition(range.endRow, range.endCol);
  return {
    startRow: first.rowBlock * DEFAULT_CHUNK_ROW_SIZE,
    startCol: first.colBlock * DEFAULT_CHUNK_COLUMN_SIZE,
    endRow: (last.rowBlock + 1) * DEFAULT_CHUNK_ROW_SIZE - 1,
    endCol: (last.colBlock + 1) * DEFAULT_CHUNK_COLUMN_SIZE - 1,
  };
}

export function chunkKeysForRange(range: CellRange): string[] {
  const expanded = expandRangeToChunks(range);
  const first = getChunkPosition(expanded.startRow, expanded.startCol);
  const last = getChunkPosition(expanded.endRow, expanded.endCol);
  const keys: string[] = [];
  for (let rowBlock = first.rowBlock; rowBlock <= last.rowBlock; rowBlock += 1) {
    for (let colBlock = first.colBlock; colBlock <= last.colBlock; colBlock += 1) {
      keys.push(getChunkKey(rowBlock, colBlock));
    }
  }
  return keys;
}

export function missingChunksForRange(cache: ViewportCacheState, range: CellRange): string[] {
  return chunkKeysForRange(range).filter((key) => !cache.loadedChunks.has(key));
}

export function viewportRangeFromScroll(
  scrollTop: number,
  scrollLeft: number,
  maxRow: number,
  maxColumn: number,
): CellRange {
  const rowLimit = Math.max(maxRow, DEFAULT_CHUNK_ROW_SIZE);
  const columnLimit = Math.max(maxColumn, DEFAULT_CHUNK_COLUMN_SIZE);
  const startRow = clamp(
    Math.floor(Math.max(0, scrollTop) / DEFAULT_ROW_HEIGHT) - PREFETCH_ROWS,
    0,
    Math.max(0, rowLimit - 1),
  );
  const startCol = clamp(
    Math.floor(Math.max(0, scrollLeft) / DEFAULT_COLUMN_WIDTH) - PREFETCH_COLUMNS,
    0,
    Math.max(0, columnLimit - 1),
  );
  return expandRangeToChunks({
    startRow,
    startCol,
    endRow: Math.min(rowLimit - 1, startRow + VIEWPORT_ROWS + PREFETCH_ROWS * 2),
    endCol: Math.min(columnLimit - 1, startCol + VIEWPORT_COLUMNS + PREFETCH_COLUMNS * 2),
  });
}

export function rangeToA1(range: CellRange): string {
  return formatA1Range(range);
}

function mergeRange(object: MergeObject): CellRange | null {
  const position = object.position;
  if (
    typeof position.startRow !== "number" ||
    typeof position.startCol !== "number" ||
    typeof position.endRow !== "number" ||
    typeof position.endCol !== "number"
  ) {
    return null;
  }
  return {
    startRow: position.startRow,
    startCol: position.startCol,
    endRow: position.endRow,
    endCol: position.endCol,
  };
}

export function mergeDocumentRange(
  cache: ViewportCacheState,
  result: DocumentRangeResult,
  columns: Array<{ label: string }>,
): void {
  for (const cell of result.cells) {
    cache.cells.set(`${cell.row},${cell.col}`, {
      r: cell.row + 1,
      c: cell.col,
      v: documentValueToFortuneValue(cell.value),
    });
  }

  for (const object of result.objects) {
    if (object.type === "custom" && object.data.kind === "merge") {
      cache.mergeObjects.set(object.id, object);
    }
  }

  for (const key of missingChunksForRange(cache, result.range)) {
    cache.loadedChunks.add(key);
  }
  cache.revision = Math.max(cache.revision, result.revision);
  cache.maxRow = Math.max(cache.maxRow, result.maxRow);
  cache.maxColumn = Math.max(cache.maxColumn, result.maxColumn);

  for (const [index, column] of columns.entries()) {
    cache.headers.set(index, { r: 0, c: index, v: { v: column.label, m: column.label } });
  }
}

export function viewportCelldata(cache: ViewportCacheState): FortuneCell[] {
  const cells = new Map<string, FortuneCell>();
  for (const [col, cell] of cache.headers) {
    cells.set(`0,${col}`, { ...cell, v: { ...cell.v } });
  }
  for (const [key, cell] of cache.cells) {
    cells.set(`${cell.r},${cell.c}`, { ...cell, v: { ...cell.v } });
  }

  for (const object of cache.mergeObjects.values()) {
    const range = mergeRange(object);
    if (!range) continue;
    const rowSpan = range.endRow - range.startRow + 1;
    const colSpan = range.endCol - range.startCol + 1;
    for (let row = range.startRow; row <= range.endRow; row += 1) {
      for (let col = range.startCol; col <= range.endCol; col += 1) {
        const key = `${row + 1},${col}`;
        const current = cells.get(key) ?? { r: row + 1, c: col, v: { v: "", m: "" } };
        current.v = {
          ...current.v,
          mc: { r: range.startRow + 1, c: range.startCol, rs: rowSpan, cs: colSpan },
        };
        cells.set(key, current);
      }
    }
  }

  return [...cells.values()].sort((left, right) => left.r - right.r || left.c - right.c);
}
