import {
  type ChunkOptions,
  createEmptyChunk,
  getChunkKey,
  getChunkPosition,
  readChunkCell,
  writeChunkCell,
} from "./chunk.js";
import type { DocumentChunk, DocumentObject, DocumentOperation, DocumentScalar } from "./model.js";
import { cellRangeSize, validateCellRange } from "./range.js";

export interface DocumentState {
  chunks: Map<string, DocumentChunk>;
  objects: Map<string, DocumentObject>;
}

export function createDocumentState(): DocumentState {
  return { chunks: new Map(), objects: new Map() };
}

function cloneState(state: DocumentState): DocumentState {
  return {
    chunks: new Map(
      [...state.chunks.entries()].map(([key, chunk]) => [
        key,
        { ...chunk, cells: { ...chunk.cells } },
      ]),
    ),
    objects: new Map(
      [...state.objects.entries()].map(([key, object]) => [
        key,
        {
          ...object,
          position: { ...object.position },
          data: { ...object.data },
        },
      ]),
    ),
  };
}

function setCell(
  state: DocumentState,
  row: number,
  col: number,
  value: Parameters<typeof writeChunkCell>[3],
  revision: number,
  options: ChunkOptions,
): void {
  const position = getChunkPosition(row, col, options);
  const key = getChunkKey(position.rowBlock, position.colBlock);
  const chunk =
    state.chunks.get(key) ?? createEmptyChunk(position.rowBlock, position.colBlock, revision);
  const next = writeChunkCell(chunk, row, col, value, options);
  next.revision = revision;
  if (Object.keys(next.cells).length === 0) {
    state.chunks.delete(key);
  } else {
    state.chunks.set(key, next);
  }
}

export function applyDocumentOperation(
  state: DocumentState,
  operation: DocumentOperation,
  revision: number,
  options: ChunkOptions = {},
): DocumentState {
  const next = cloneState(state);

  switch (operation.type) {
    case "setCell":
      setCell(next, operation.row, operation.col, operation.value, revision, options);
      break;
    case "setRangeValues": {
      validateCellRange(operation.range);
      const { rows, cols } = cellRangeSize(operation.range);
      for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
        for (let colOffset = 0; colOffset < cols; colOffset += 1) {
          const rawValue: DocumentScalar = operation.values[rowOffset]?.[colOffset] ?? null;
          const formula = operation.formulas?.[rowOffset]?.[colOffset] ?? undefined;
          setCell(
            next,
            operation.range.startRow + rowOffset,
            operation.range.startCol + colOffset,
            formula || rawValue !== null ? { value: rawValue, formula } : null,
            revision,
            options,
          );
        }
      }
      break;
    }
    case "clearRange": {
      validateCellRange(operation.range);
      for (let row = operation.range.startRow; row <= operation.range.endRow; row += 1) {
        for (let col = operation.range.startCol; col <= operation.range.endCol; col += 1) {
          setCell(next, row, col, null, revision, options);
        }
      }
      break;
    }
    case "createObject":
      next.objects.set(operation.object.id, { ...operation.object });
      break;
    case "updateObject": {
      const current = next.objects.get(operation.id);
      if (!current) break;
      next.objects.set(operation.id, {
        ...current,
        position: operation.patch.position
          ? { ...current.position, ...operation.patch.position }
          : current.position,
        data: operation.patch.data ? { ...current.data, ...operation.patch.data } : current.data,
      });
      break;
    }
    case "deleteObject":
      next.objects.delete(operation.id);
      break;
    case "replaceSnapshot":
      break;
  }

  return next;
}

export function applyDocumentOperations(
  state: DocumentState,
  operations: DocumentOperation[],
  startRevision: number,
  options: ChunkOptions = {},
): DocumentState {
  return operations.reduce(
    (current, operation, index) =>
      applyDocumentOperation(current, operation, startRevision + index + 1, options),
    state,
  );
}

export function readDocumentCell(
  state: DocumentState,
  row: number,
  col: number,
  options: ChunkOptions = {},
) {
  const position = getChunkPosition(row, col, options);
  const chunk = state.chunks.get(getChunkKey(position.rowBlock, position.colBlock));
  return readChunkCell(chunk, row, col, options);
}
