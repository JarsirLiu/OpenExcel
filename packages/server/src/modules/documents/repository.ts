import {
  applyDocumentOperations,
  type CellRange,
  createDocumentState,
  type DocumentCell,
  type DocumentChunk,
  type DocumentObject,
  type DocumentOperation,
  type DocumentState,
  decodeDocumentJson,
  encodeDocumentJson,
  getChunkKey,
  getChunkPosition,
} from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";
import type { Prisma } from "../../infra/database/prismaTypes.js";
import { syncFormulaIndex } from "./formulaIndex.js";
import { recalculateAffectedFormulas } from "./recalculation.js";

const DOCUMENT_FORMAT = "openexcel-document-v1";
const CHUNK_ROW_SIZE = 128;
const CHUNK_COLUMN_SIZE = 64;

function decodeChunk(row: {
  rowBlock: number;
  colBlock: number;
  revision: number;
  codec: string;
  data: Uint8Array<ArrayBufferLike>;
}): DocumentChunk {
  const payload = decodeDocumentJson<{ cells: DocumentChunk["cells"] }>(row.data);
  return {
    rowBlock: row.rowBlock,
    colBlock: row.colBlock,
    revision: row.revision,
    codec: row.codec as DocumentChunk["codec"],
    cells: payload.cells ?? {},
  };
}

function decodeObject(row: {
  id: number;
  type: string;
  position: Uint8Array<ArrayBufferLike>;
  data: Uint8Array<ArrayBufferLike>;
}): DocumentObject {
  const storedData = decodeDocumentJson<Record<string, unknown>>(row.data);
  const logicalId = storedData.__openexcelObjectId;
  const { __openexcelObjectId: _ignored, ...data } = storedData;
  return {
    id: typeof logicalId === "string" ? logicalId : String(row.id),
    type: row.type as DocumentObject["type"],
    position: decodeDocumentJson<Record<string, unknown>>(row.position),
    data,
  };
}

function encodeObjectData(object: DocumentObject): Uint8Array<ArrayBuffer> {
  return encodeDocumentJson({ ...object.data, __openexcelObjectId: object.id });
}

function chunkKeysForOperation(operation: DocumentOperation): Set<string> {
  const keys = new Set<string>();
  const addRange = (range: CellRange) => {
    const first = getChunkPosition(range.startRow, range.startCol);
    const last = getChunkPosition(range.endRow, range.endCol);
    for (let rowBlock = first.rowBlock; rowBlock <= last.rowBlock; rowBlock += 1) {
      for (let colBlock = first.colBlock; colBlock <= last.colBlock; colBlock += 1) {
        keys.add(getChunkKey(rowBlock, colBlock));
      }
    }
  };

  switch (operation.type) {
    case "setCell":
      addRange({
        startRow: operation.row,
        startCol: operation.col,
        endRow: operation.row,
        endCol: operation.col,
      });
      break;
    case "setRangeValues":
    case "clearRange":
      addRange(operation.range);
      break;
    default:
      break;
  }
  return keys;
}

function stateFromChunks(chunks: Iterable<DocumentChunk>): DocumentState {
  const state = createDocumentState();
  for (const chunk of chunks) {
    state.chunks.set(getChunkKey(chunk.rowBlock, chunk.colBlock), chunk);
  }
  return state;
}

function cellsFromChunks(chunks: Iterable<DocumentChunk>, range: CellRange): DocumentCell[] {
  const cells: DocumentCell[] = [];
  for (const chunk of chunks) {
    for (const [key, value] of Object.entries(chunk.cells)) {
      const [rowOffset, colOffset] = key.split(",").map(Number);
      const row = chunk.rowBlock * CHUNK_ROW_SIZE + rowOffset;
      const col = chunk.colBlock * CHUNK_COLUMN_SIZE + colOffset;
      if (
        row >= range.startRow &&
        row <= range.endRow &&
        col >= range.startCol &&
        col <= range.endCol
      ) {
        cells.push({ row, col, value });
      }
    }
  }
  return cells.sort((left, right) => left.row - right.row || left.col - right.col);
}

function objectIntersectsRange(object: DocumentObject, range: CellRange): boolean {
  const position = object.position;
  if (
    typeof position.startRow !== "number" ||
    typeof position.startCol !== "number" ||
    typeof position.endRow !== "number" ||
    typeof position.endCol !== "number"
  ) {
    return true;
  }
  return !(
    position.endRow < range.startRow ||
    position.startRow > range.endRow ||
    position.endCol < range.startCol ||
    position.startCol > range.endCol
  );
}

function operationRanges(operation: DocumentOperation): CellRange[] {
  switch (operation.type) {
    case "setCell":
      return [
        {
          startRow: operation.row,
          startCol: operation.col,
          endRow: operation.row,
          endCol: operation.col,
        },
      ];
    case "setRangeValues":
    case "clearRange":
      return [operation.range];
    default:
      return [];
  }
}

function operationExtent(
  operation: DocumentOperation,
): { maxRow: number; maxColumn: number } | null {
  switch (operation.type) {
    case "setCell":
      return { maxRow: operation.row + 1, maxColumn: operation.col + 1 };
    case "setRangeValues":
    case "clearRange":
      return { maxRow: operation.range.endRow + 1, maxColumn: operation.range.endCol + 1 };
    default:
      return null;
  }
}

export interface DocumentRevision {
  sheetId: number;
  format: string;
  version: number;
  revision: number;
  maxRow: number;
  maxColumn: number;
}

export interface DocumentRangeResult extends DocumentRevision {
  range: CellRange;
  cells: DocumentCell[];
  objects: DocumentObject[];
}

export interface DocumentSheetInfo extends DocumentRevision {
  sheetNo: number;
  name: string;
}

export interface DocumentMutationResult {
  revision: number;
  changedRanges: CellRange[];
  objectIds: string[];
  calculatedCells: Array<{
    sheetName: string;
    row: number;
    col: number;
    value: string | number | boolean | null;
    formula?: string;
    error?: string;
  }>;
}

export interface DocumentRevisionConflict {
  conflict: true;
  currentRevision: number;
}

function bytesToNumbers(data: Uint8Array<ArrayBufferLike>): number[] {
  return Array.from(data);
}

async function captureDocumentSnapshot(
  tx: Prisma.TransactionClient,
  runId: number,
  sheetId: number,
  chunks: Array<{
    rowBlock: number;
    colBlock: number;
    revision: number;
    codec: string;
    data: Uint8Array<ArrayBufferLike>;
  }>,
  objects: Array<{
    type: string;
    position: Uint8Array<ArrayBufferLike>;
    data: Uint8Array<ArrayBufferLike>;
  }>,
  revision: number,
  maxRow: number,
  maxColumn: number,
) {
  const existing = await tx.agentRunSheetSnapshot.findUnique({
    where: { runId_sheetId: { runId, sheetId } },
    select: { id: true },
  });
  if (existing) return;

  await tx.agentRunSheetSnapshot.create({
    data: {
      runId,
      sheetId,
      documentRevision: revision,
      documentMaxRow: maxRow,
      documentMaxColumn: maxColumn,
      documentChunks: encodeDocumentJson({
        chunks: chunks.map((chunk) => ({
          rowBlock: chunk.rowBlock,
          colBlock: chunk.colBlock,
          revision: chunk.revision,
          codec: chunk.codec,
          data: bytesToNumbers(chunk.data),
        })),
      }),
      documentObjects: encodeDocumentJson({
        objects: objects.map((object) => ({
          type: object.type,
          position: bytesToNumbers(object.position),
          data: bytesToNumbers(object.data),
        })),
      }),
    },
  });
}

export async function getDocumentRevision(
  sheetId: number,
  workspaceId: number,
): Promise<DocumentRevision | null> {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, workbook: { workspaceId } },
    select: {
      id: true,
      documentFormat: true,
      documentVersion: true,
      documentRevision: true,
      maxRow: true,
      maxColumn: true,
    },
  });
  if (!sheet) return null;
  return {
    sheetId: sheet.id,
    format: sheet.documentFormat,
    version: sheet.documentVersion,
    revision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
  };
}

export async function getDocumentSheetInfo(
  sheetId: number,
  workspaceId: number,
): Promise<DocumentSheetInfo | null> {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, workbook: { workspaceId } },
    select: {
      id: true,
      sheetNo: true,
      name: true,
      documentFormat: true,
      documentVersion: true,
      documentRevision: true,
      maxRow: true,
      maxColumn: true,
    },
  });
  if (!sheet) return null;
  return {
    sheetId: sheet.id,
    sheetNo: sheet.sheetNo,
    name: sheet.name,
    format: sheet.documentFormat,
    version: sheet.documentVersion,
    revision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
  };
}

export async function readDocumentRange(
  sheetId: number,
  workspaceId: number,
  range: CellRange,
): Promise<DocumentRangeResult | null> {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, workbook: { workspaceId } },
    select: {
      id: true,
      documentFormat: true,
      documentVersion: true,
      documentRevision: true,
      maxRow: true,
      maxColumn: true,
    },
  });
  if (!sheet) return null;

  const first = getChunkPosition(range.startRow, range.startCol);
  const last = getChunkPosition(range.endRow, range.endCol);
  const rows = await prisma.sheetChunk.findMany({
    where: {
      sheetId,
      rowBlock: { gte: first.rowBlock, lte: last.rowBlock },
      colBlock: { gte: first.colBlock, lte: last.colBlock },
    },
    orderBy: [{ rowBlock: "asc" }, { colBlock: "asc" }],
  });
  const chunks = rows.map(decodeChunk);
  const objectRows = await prisma.sheetObject.findMany({
    where: { sheetId },
    orderBy: { id: "asc" },
  });

  return {
    sheetId: sheet.id,
    format: sheet.documentFormat,
    version: sheet.documentVersion,
    revision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
    range,
    cells: cellsFromChunks(chunks, range),
    objects: objectRows.map(decodeObject).filter((object) => objectIntersectsRange(object, range)),
  };
}

export async function applyStoredDocumentOperation(
  sheetId: number,
  workspaceId: number,
  operation: DocumentOperation,
  expectedRevision?: number,
): Promise<DocumentMutationResult | DocumentRevisionConflict | null> {
  return applyStoredDocumentOperations(sheetId, workspaceId, [operation], expectedRevision);
}

export async function applyStoredDocumentOperations(
  sheetId: number,
  workspaceId: number,
  operations: DocumentOperation[],
  expectedRevision?: number,
  runId?: number,
): Promise<DocumentMutationResult | DocumentRevisionConflict | null> {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId, workbook: { workspaceId } },
      select: {
        id: true,
        workbookId: true,
        documentRevision: true,
        maxRow: true,
        maxColumn: true,
      },
    });
    if (!sheet) return null;
    if (expectedRevision !== undefined && expectedRevision !== sheet.documentRevision) {
      return { conflict: true, currentRevision: sheet.documentRevision };
    }

    const chunkKeys = new Set<string>();
    let maxRow = sheet.maxRow;
    let maxColumn = sheet.maxColumn;
    const objectOperationIds = new Set<string>();
    const changedRanges: CellRange[] = [];
    for (const operation of operations) {
      for (const key of chunkKeysForOperation(operation)) chunkKeys.add(key);
      const extent = operationExtent(operation);
      maxRow = Math.max(maxRow, extent?.maxRow ?? 0);
      maxColumn = Math.max(maxColumn, extent?.maxColumn ?? 0);
      changedRanges.push(...operationRanges(operation));
      if (
        operation.type === "createObject" ||
        operation.type === "updateObject" ||
        operation.type === "deleteObject"
      ) {
        objectOperationIds.add(
          operation.type === "createObject" ? operation.object.id : operation.id,
        );
      }
    }
    const chunkPositions = [...chunkKeys].map((key) => {
      const [rowBlock, colBlock] = key.split(":").map(Number);
      return { rowBlock, colBlock };
    });
    const chunkRows =
      chunkPositions.length === 0
        ? []
        : await tx.sheetChunk.findMany({
            where: {
              sheetId,
              OR: chunkPositions,
            },
          });
    const objectRows =
      objectOperationIds.size > 0 ? await tx.sheetObject.findMany({ where: { sheetId } }) : [];
    const state = stateFromChunks(chunkRows.map(decodeChunk));
    for (const row of objectRows) {
      const object = decodeObject(row);
      state.objects.set(object.id, object);
    }
    const nextState = applyDocumentOperations(state, operations, sheet.documentRevision);
    const revision = sheet.documentRevision + operations.length;

    await syncFormulaIndex(tx, sheet.workbookId, sheet.id, operations);

    if (runId != null) {
      const [snapshotChunks, snapshotObjects] = await Promise.all([
        tx.sheetChunk.findMany({ where: { sheetId } }),
        tx.sheetObject.findMany({ where: { sheetId } }),
      ]);
      await captureDocumentSnapshot(
        tx,
        runId,
        sheet.id,
        snapshotChunks,
        snapshotObjects,
        sheet.documentRevision,
        sheet.maxRow,
        sheet.maxColumn,
      );
    }

    const revisionUpdate = await tx.sheet.updateMany({
      where: { id: sheet.id, documentRevision: sheet.documentRevision },
      data: {
        documentFormat: DOCUMENT_FORMAT,
        documentVersion: 1,
        documentRevision: revision,
        maxRow,
        maxColumn,
      },
    });
    if (revisionUpdate.count !== 1) {
      const current = await tx.sheet.findUnique({
        where: { id: sheet.id },
        select: { documentRevision: true },
      });
      return {
        conflict: true,
        currentRevision: current?.documentRevision ?? sheet.documentRevision,
      };
    }

    for (const key of chunkKeys) {
      const [rowBlock, colBlock] = key.split(":").map(Number);
      const chunk = nextState.chunks.get(key);
      if (!chunk || Object.keys(chunk.cells).length === 0) {
        await tx.sheetChunk.deleteMany({ where: { sheetId, rowBlock, colBlock } });
        continue;
      }
      await tx.sheetChunk.upsert({
        where: { sheetId_rowBlock_colBlock: { sheetId, rowBlock, colBlock } },
        create: {
          sheetId,
          rowBlock,
          colBlock,
          revision,
          codec: "json-v1",
          data: encodeDocumentJson({ cells: chunk.cells }),
        },
        update: {
          revision,
          codec: "json-v1",
          data: encodeDocumentJson({ cells: chunk.cells }),
        },
      });
    }

    const calculatedCells = await recalculateAffectedFormulas(
      tx,
      sheet.workbookId,
      changedRanges.map((range) => ({ sheetId: sheet.id, range })),
      revision,
    );

    const objectIds = [...objectOperationIds];
    if (objectOperationIds.size > 0) {
      const objects = objectRows.map(decodeObject);
      const objectRowsByLogicalId = new Map(
        objectRows.map((row, index) => [objects[index].id, row]),
      );

      for (const objectId of objectOperationIds) {
        const existing = objectRowsByLogicalId.get(objectId);
        const object = nextState.objects.get(objectId);
        if (object) {
          if (existing) {
            await tx.sheetObject.update({
              where: { id: existing.id },
              data: {
                type: object.type,
                position: encodeDocumentJson(object.position),
                data: encodeObjectData(object),
              },
            });
          } else {
            await tx.sheetObject.create({
              data: {
                sheetId,
                type: object.type,
                position: encodeDocumentJson(object.position),
                data: encodeObjectData(object),
              },
            });
          }
        } else if (existing) {
          await tx.sheetObject.delete({ where: { id: existing.id } });
        }
      }
    }

    for (const [index, operation] of operations.entries()) {
      await tx.sheetOperation.create({
        data: {
          workbookId: sheet.workbookId,
          sheetId: sheet.id,
          revision: sheet.documentRevision + index + 1,
          type: operation.type,
          payload: encodeDocumentJson(operation),
        },
      });
    }

    return { revision, changedRanges, objectIds, calculatedCells };
  });
}

export async function updateDocumentLayout(
  sheetId: number,
  workspaceId: number,
  config: unknown,
  expectedRevision?: number,
): Promise<DocumentMutationResult | DocumentRevisionConflict | null> {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId, workbook: { workspaceId } },
      select: { id: true, workbookId: true, documentRevision: true },
    });
    if (!sheet) return null;
    if (expectedRevision !== undefined && expectedRevision !== sheet.documentRevision) {
      return { conflict: true, currentRevision: sheet.documentRevision };
    }

    const revision = sheet.documentRevision + 1;
    const updated = await tx.sheet.updateMany({
      where: { id: sheet.id, documentRevision: sheet.documentRevision },
      data: {
        config: JSON.stringify(config ?? null),
        documentFormat: DOCUMENT_FORMAT,
        documentVersion: 1,
        documentRevision: revision,
      },
    });
    if (updated.count !== 1) {
      const current = await tx.sheet.findUnique({
        where: { id: sheet.id },
        select: { documentRevision: true },
      });
      return {
        conflict: true,
        currentRevision: current?.documentRevision ?? sheet.documentRevision,
      };
    }

    await tx.sheetOperation.create({
      data: {
        workbookId: sheet.workbookId,
        sheetId: sheet.id,
        revision,
        type: "updateLayout",
        payload: encodeDocumentJson({ type: "updateLayout", config }),
      },
    });
    return { revision, changedRanges: [], objectIds: [], calculatedCells: [] };
  });
}
