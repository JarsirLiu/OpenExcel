import {
  type CellRange,
  type DocumentChunk,
  type DocumentOperation,
  decodeDocumentJson,
  encodeDocumentJson,
  getChunkKey,
  getChunkPosition,
} from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";

export interface DocumentRevision {
  sheetId: number;
  format: string;
  version: number;
  revision: number;
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
    },
  });
  if (!sheet) return null;
  return {
    sheetId: sheet.id,
    format: sheet.documentFormat,
    version: sheet.documentVersion,
    revision: sheet.documentRevision,
  };
}

export async function readDocumentChunks(
  sheetId: number,
  workspaceId: number,
  range: CellRange,
): Promise<DocumentChunk[] | null> {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, workbook: { workspaceId } },
    select: { id: true },
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

  return rows.map((row) => ({
    ...decodeDocumentJson<Omit<DocumentChunk, "revision" | "codec">>(row.data),
    rowBlock: row.rowBlock,
    colBlock: row.colBlock,
    revision: row.revision,
    codec: row.codec as "json-v1",
  }));
}

export async function appendDocumentOperation(
  sheetId: number,
  workspaceId: number,
  operation: DocumentOperation,
): Promise<{ revision: number } | null> {
  return prisma.$transaction(async (tx) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId, workbook: { workspaceId } },
      select: { id: true, workbookId: true, documentRevision: true },
    });
    if (!sheet) return null;

    const revision = sheet.documentRevision + 1;
    await tx.sheet.update({
      where: { id: sheet.id },
      data: {
        documentFormat: "openexcel-document-v1",
        documentVersion: 1,
        documentRevision: revision,
      },
    });
    await tx.sheetOperation.create({
      data: {
        workbookId: sheet.workbookId,
        sheetId: sheet.id,
        revision,
        type: operation.type,
        payload: encodeDocumentJson(operation),
      },
    });
    return { revision };
  });
}

export async function saveDocumentChunk(
  sheetId: number,
  workspaceId: number,
  chunk: DocumentChunk,
): Promise<boolean> {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId, workbook: { workspaceId } },
    select: { id: true, documentRevision: true },
  });
  if (!sheet) return false;

  const data = { ...chunk };
  delete (data as Partial<DocumentChunk>).rowBlock;
  delete (data as Partial<DocumentChunk>).colBlock;
  delete (data as Partial<DocumentChunk>).revision;
  delete (data as Partial<DocumentChunk>).codec;

  await prisma.sheetChunk.upsert({
    where: {
      sheetId_rowBlock_colBlock: {
        sheetId,
        rowBlock: chunk.rowBlock,
        colBlock: chunk.colBlock,
      },
    },
    create: {
      sheetId,
      rowBlock: chunk.rowBlock,
      colBlock: chunk.colBlock,
      revision: chunk.revision || sheet.documentRevision,
      codec: chunk.codec,
      data: encodeDocumentJson(data),
    },
    update: {
      revision: chunk.revision || sheet.documentRevision,
      codec: chunk.codec,
      data: encodeDocumentJson(data),
    },
  });
  return true;
}

export function chunkMapKey(rowBlock: number, colBlock: number): string {
  return getChunkKey(rowBlock, colBlock);
}
