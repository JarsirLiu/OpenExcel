import type { FortuneCell, FortuneCellValue } from "../excel/celldataUtils.js";
import { type ChunkOptions, createEmptyChunk, getChunkKey, getChunkPosition } from "./chunk.js";
import type { DocumentCellValue, DocumentChunk } from "./model.js";
import {
  applyCellStyle,
  cellStyleId,
  type DocumentStyleResolver,
  extractCellStyle,
  stripCellStyle,
} from "./style.js";

function isDocumentScalar(value: unknown): value is string | number | boolean | null {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

export function fortuneCellToDocumentValue(value: FortuneCellValue): DocumentCellValue {
  const rawValue = value.v;
  const style = extractCellStyle(value);
  const metadata = stripCellStyle(value);
  return {
    value: isDocumentScalar(rawValue) ? rawValue : rawValue == null ? null : String(rawValue),
    displayValue: value.m || undefined,
    formula: value.f,
    styleId: style ? cellStyleId(style) : undefined,
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
  };
}

export function documentValueToFortuneValue(
  value: DocumentCellValue,
  styles?: DocumentStyleResolver,
): FortuneCellValue {
  const metadata = value.metadata ?? {};
  const result: FortuneCellValue = {
    ...(metadata as Partial<FortuneCellValue>),
    v: value.value,
    m: value.displayValue ?? (value.value == null ? "" : String(value.value)),
    ...(value.formula ? { f: value.formula } : {}),
  };
  return applyCellStyle(result, value.styleId, styles);
}

export function fortuneCelldataToChunks(
  celldata: FortuneCell[],
  revision = 0,
  options: ChunkOptions = {},
): Map<string, DocumentChunk> {
  const chunks = new Map<string, DocumentChunk>();
  for (const cell of celldata) {
    const position = getChunkPosition(cell.r, cell.c, options);
    const key = getChunkKey(position.rowBlock, position.colBlock);
    const chunk =
      chunks.get(key) ?? createEmptyChunk(position.rowBlock, position.colBlock, revision);
    chunk.cells[`${position.rowOffset},${position.colOffset}`] = fortuneCellToDocumentValue(cell.v);
    chunks.set(key, chunk);
  }
  return chunks;
}

export function chunksToFortuneCelldata(
  chunks: Iterable<DocumentChunk> | ReadonlyMap<string, DocumentChunk>,
  options: ChunkOptions = {},
  styles?: DocumentStyleResolver,
): FortuneCell[] {
  const cells: FortuneCell[] = [];
  const iterable = chunks instanceof Map ? chunks.values() : chunks;
  for (const chunk of iterable) {
    for (const [key, value] of Object.entries(chunk.cells) as Array<[string, DocumentCellValue]>) {
      const [rowOffset, colOffset] = key.split(",").map(Number);
      const row = chunk.rowBlock * (options.rowSize ?? 128) + rowOffset;
      const col = chunk.colBlock * (options.columnSize ?? 64) + colOffset;
      cells.push({ r: row, c: col, v: documentValueToFortuneValue(value, styles) });
    }
  }
  return cells.sort((left, right) => left.r - right.r || left.c - right.c);
}
