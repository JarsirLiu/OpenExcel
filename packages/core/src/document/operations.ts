import {
  type ChunkOptions,
  createEmptyChunk,
  getChunkKey,
  getChunkPosition,
  readChunkCell,
} from "./chunk.js";
import type {
  DocumentCellValue,
  DocumentChunk,
  DocumentObject,
  DocumentOperation,
  DocumentScalar,
} from "./model.js";
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
  value: DocumentCellValue | null,
  revision: number,
  options: ChunkOptions,
): void {
  const position = getChunkPosition(row, col, options);
  const key = getChunkKey(position.rowBlock, position.colBlock);
  const chunk =
    state.chunks.get(key) ?? createEmptyChunk(position.rowBlock, position.colBlock, revision);
  const cellKey = `${position.rowOffset},${position.colOffset}`;
  if (value == null) {
    delete chunk.cells[cellKey];
    if (Object.keys(chunk.cells).length === 0) {
      state.chunks.delete(key);
      return;
    }
  } else {
    chunk.cells[cellKey] = value;
  }
  chunk.revision = revision;
  state.chunks.set(key, chunk);
}

function clearRange(
  state: DocumentState,
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
  revision: number,
  options: ChunkOptions,
): void {
  const first = getChunkPosition(range.startRow, range.startCol, options);
  const last = getChunkPosition(range.endRow, range.endCol, options);
  const rowSize = options.rowSize ?? 128;
  const columnSize = options.columnSize ?? 64;

  for (let rowBlock = first.rowBlock; rowBlock <= last.rowBlock; rowBlock += 1) {
    for (let colBlock = first.colBlock; colBlock <= last.colBlock; colBlock += 1) {
      const key = getChunkKey(rowBlock, colBlock);
      const chunk = state.chunks.get(key);
      if (!chunk) continue;

      for (const cellKey of Object.keys(chunk.cells)) {
        const [rowOffset, colOffset] = cellKey.split(",").map(Number);
        const row = rowBlock * rowSize + rowOffset;
        const col = colBlock * columnSize + colOffset;
        if (
          row >= range.startRow &&
          row <= range.endRow &&
          col >= range.startCol &&
          col <= range.endCol
        ) {
          delete chunk.cells[cellKey];
        }
      }

      if (Object.keys(chunk.cells).length === 0) {
        state.chunks.delete(key);
      } else {
        chunk.revision = revision;
      }
    }
  }
}

function setRangeStyle(
  state: DocumentState,
  range: { startRow: number; startCol: number; endRow: number; endCol: number },
  styleId: string | null,
  revision: number,
  options: ChunkOptions,
): void {
  for (let row = range.startRow; row <= range.endRow; row += 1) {
    for (let col = range.startCol; col <= range.endCol; col += 1) {
      const current = readDocumentCell(state, row, col, options);
      if (!current && styleId === null) continue;
      const next = current
        ? { ...current, styleId: styleId ?? undefined }
        : { value: null, styleId: styleId ?? undefined };
      const hasContent =
        next.value !== null ||
        next.formula !== undefined ||
        next.displayValue !== undefined ||
        next.metadata !== undefined;
      setCell(state, row, col, hasContent || next.styleId ? next : null, revision, options);
    }
  }
}

function applyDocumentOperationInPlace(
  state: DocumentState,
  operation: DocumentOperation,
  revision: number,
  options: ChunkOptions = {},
): DocumentState {
  switch (operation.type) {
    case "setCell":
      setCell(state, operation.row, operation.col, operation.value, revision, options);
      break;
    case "setRangeValues": {
      validateCellRange(operation.range);
      const { rows, cols } = cellRangeSize(operation.range);
      if (operation.values.length !== rows || operation.values.some((row) => row.length !== cols)) {
        throw new Error("Range values must match the target range dimensions");
      }
      if (
        operation.formulas &&
        (operation.formulas.length !== rows ||
          operation.formulas.some((row) => row.length !== cols))
      ) {
        throw new Error("Range formulas must match the target range dimensions");
      }
      for (let rowOffset = 0; rowOffset < rows; rowOffset += 1) {
        for (let colOffset = 0; colOffset < cols; colOffset += 1) {
          const rawValue: DocumentScalar = operation.values[rowOffset]?.[colOffset] ?? null;
          const formula = operation.formulas?.[rowOffset]?.[colOffset] ?? undefined;
          setCell(
            state,
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
    case "setRangeStyle":
      validateCellRange(operation.range);
      setRangeStyle(state, operation.range, operation.styleId, revision, options);
      break;
    case "clearRange": {
      validateCellRange(operation.range);
      clearRange(state, operation.range, revision, options);
      break;
    }
    case "createObject":
      state.objects.set(operation.object.id, { ...operation.object });
      break;
    case "updateObject": {
      const current = state.objects.get(operation.id);
      if (!current) break;
      state.objects.set(operation.id, {
        ...current,
        position: operation.patch.position
          ? { ...current.position, ...operation.patch.position }
          : current.position,
        data: operation.patch.data ? { ...current.data, ...operation.patch.data } : current.data,
      });
      break;
    }
    case "deleteObject":
      state.objects.delete(operation.id);
      break;
    case "replaceSnapshot":
      break;
  }

  return state;
}

export function applyDocumentOperation(
  state: DocumentState,
  operation: DocumentOperation,
  revision: number,
  options: ChunkOptions = {},
): DocumentState {
  return applyDocumentOperationInPlace(cloneState(state), operation, revision, options);
}

export function applyDocumentOperations(
  state: DocumentState,
  operations: DocumentOperation[],
  startRevision: number,
  options: ChunkOptions = {},
): DocumentState {
  const next = cloneState(state);
  for (const [index, operation] of operations.entries()) {
    applyDocumentOperationInPlace(next, operation, startRevision + index + 1, options);
  }
  return next;
}

function canCoalesceCellValue(value: DocumentCellValue | null): boolean {
  if (value == null) return true;
  if (value.formula || value.styleId || value.metadata) return false;
  if (value.displayValue === undefined) return true;
  return value.displayValue === (value.value == null ? "" : String(value.value));
}

function coalescedRangeOperation(
  operations: Array<Extract<DocumentOperation, { type: "setCell" }>>,
): DocumentOperation {
  const first = operations[0];
  const last = operations[operations.length - 1];
  if (!first || !last || operations.length === 1) return first;
  return {
    type: "setRangeValues",
    range: {
      startRow: first.row,
      startCol: first.col,
      endRow: last.row,
      endCol: last.col,
    },
    values: [operations.map((operation) => operation.value?.value ?? null)],
  };
}

/**
 * Compacts only lossless horizontal scalar writes. Rich cell values stay as
 * setCell operations because setRangeValues intentionally has a scalar-only payload.
 */
export function coalesceDocumentOperations(operations: DocumentOperation[]): DocumentOperation[] {
  const result: DocumentOperation[] = [];
  let pending: Array<Extract<DocumentOperation, { type: "setCell" }>> = [];

  const flush = () => {
    if (pending.length > 0) result.push(coalescedRangeOperation(pending));
    pending = [];
  };

  for (const operation of operations) {
    if (
      operation.type === "setCell" &&
      canCoalesceCellValue(operation.value) &&
      (pending.length === 0 ||
        (pending.at(-1)?.row === operation.row && pending.at(-1)?.col === operation.col - 1))
    ) {
      pending.push(operation);
      continue;
    }
    flush();
    result.push(operation);
  }
  flush();
  return result;
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
