import { encodeDocumentJson, type FortuneCell, fortuneCelldataToChunks } from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";
import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";

export async function findSheetWithWorkbook(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: { include: { sheets: { orderBy: { order: "asc" } } } } },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return sheet;
}

export async function updateSheetData(
  sheetId: number,
  data: { uploadedData: string; config?: string },
  workspaceId: number,
) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;

  let celldata: FortuneCell[] = [];
  try {
    const parsed = JSON.parse(data.uploadedData) as unknown;
    if (Array.isArray(parsed)) celldata = parsed as FortuneCell[];
  } catch {
    celldata = [];
  }

  const nextRevision = sheet.documentRevision + 1;
  const chunks = fortuneCelldataToChunks(celldata, nextRevision);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sheet.update({
      where: { id: sheet.id },
      data: {
        uploadedData: data.uploadedData,
        config: data.config ?? null,
        documentFormat: "openexcel-document-v1",
        documentVersion: 1,
        documentRevision: nextRevision,
      },
    });

    await tx.sheetChunk.deleteMany({ where: { sheetId: sheet.id } });
    for (const chunk of chunks.values()) {
      await tx.sheetChunk.create({
        data: {
          sheetId: sheet.id,
          rowBlock: chunk.rowBlock,
          colBlock: chunk.colBlock,
          revision: nextRevision,
          codec: chunk.codec,
          data: encodeDocumentJson({ cells: chunk.cells }),
        },
      });
    }

    await tx.sheetOperation.create({
      data: {
        workbookId: sheet.workbookId,
        sheetId: sheet.id,
        revision: nextRevision,
        type: "replaceSnapshot",
        payload: encodeDocumentJson({
          type: "replaceSnapshot",
          sourceFormat: "fortune-celldata-v1",
        }),
      },
    });

    return updated;
  });
}

export async function updateSheetName(sheetId: number, name: string, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return prisma.sheet.update({
    where: { id: sheet.id },
    data: { name },
  });
}

export async function deleteSheet(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return prisma.sheet.delete({ where: { id: sheet.id } });
}

export async function deleteSheetAndReindex(
  workbookId: number,
  sheetId: number,
  workspaceId: number,
) {
  await prisma.$transaction(async (tx) => {
    const sheet = await tx.sheet.findFirst({
      where: { id: sheetId },
      include: { workbook: true },
    });
    if (!sheet) return;
    if (sheet.workbook.workspaceId !== workspaceId) return;
    await tx.sheet.delete({ where: { id: sheet.id } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    for (let index = 0; index < sheets.length; index += 1) {
      const currentSheet = sheets[index];
      await tx.sheet.update({
        where: { id: currentSheet.id },
        data: { order: index, sheetNo: index + 1 },
      });
    }
  });
}

export async function getSheet(sheetId: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id: sheetId },
  });
  if (!sheet) return null;
  const workbook = await prisma.workbook.findFirst({
    where: { id: sheet.workbookId, workspaceId },
  });
  if (!workbook) return null;
  return deserializeSheet(sheet);
}
