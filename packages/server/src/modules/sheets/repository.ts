import {
  chunksToFortuneCelldata,
  collectDocumentStyles,
  decodeDocumentJson,
  encodeDocumentJson,
  type FortuneCell,
  fortuneCelldataToChunks,
} from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";
import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";
import { buildFormulaCellData } from "../documents/formulaIndex.js";
import { loadCellStyles, registerCellStyles } from "../documents/styleRegistry.js";

function normalizeRendererCelldata(
  celldata: FortuneCell[],
  columns: Array<{ label: string }>,
): FortuneCell[] {
  if (columns.length === 0) return celldata;
  const headers = new Map(
    celldata.filter((cell) => cell.r === 0).map((cell) => [cell.c, String(cell.v?.v ?? "")]),
  );
  const hasRendererHeader = columns.every((column, index) => headers.get(index) === column.label);
  if (!hasRendererHeader) return celldata;
  return celldata
    .filter((cell) => cell.r > 0)
    .map((cell) => ({
      ...cell,
      r: cell.r - 1,
      v: cell.v?.mc ? { ...cell.v, mc: { ...cell.v.mc, r: cell.v.mc.r - 1 } } : cell.v,
    }));
}

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

  const columns = deserializeSheet(sheet).columns;
  celldata = normalizeRendererCelldata(celldata, columns);

  const nextRevision = sheet.documentRevision + 1;
  const chunks = fortuneCelldataToChunks(celldata, nextRevision);
  const maxRow = celldata.reduce((max, cell) => Math.max(max, cell.r + 1), 0);
  const maxColumn = celldata.reduce((max, cell) => Math.max(max, cell.c + 1), 0);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.sheet.update({
      where: { id: sheet.id },
      data: {
        uploadedData: JSON.stringify(celldata),
        config: data.config ?? null,
        documentFormat: "openexcel-document-v1",
        documentVersion: 1,
        documentRevision: nextRevision,
        maxRow,
        maxColumn,
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

    const formulaCells = buildFormulaCellData(sheet.id, celldata);
    const styles = [...collectDocumentStyles(celldata)].map(([id, style]) => ({ id, style }));
    await registerCellStyles(tx, sheet.workbookId, styles);
    await tx.formulaCell.deleteMany({ where: { sheetId: sheet.id } });
    if (formulaCells.length > 0) {
      await tx.formulaCell.createMany({ data: formulaCells });
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

  const [chunkRows, objectRows] = await Promise.all([
    prisma.sheetChunk.findMany({
      where: { sheetId },
      orderBy: [{ rowBlock: "asc" }, { colBlock: "asc" }],
    }),
    prisma.sheetObject.findMany({ where: { sheetId }, orderBy: { id: "asc" } }),
  ]);
  const chunks = chunkRows.map((row) => ({
    ...decodeDocumentJson<{ cells: Record<string, any> }>(row.data),
    rowBlock: row.rowBlock,
    colBlock: row.colBlock,
    revision: row.revision,
    codec: row.codec as "json-v1",
  }));
  const styleIds = chunks.flatMap((chunk) =>
    Object.values(chunk.cells).flatMap((cell) => (cell.styleId ? [cell.styleId] : [])),
  );
  const styles = await loadCellStyles(prisma, sheet.workbookId, styleIds);
  const rawCelldata = chunksToFortuneCelldata(chunks, {}, styles);
  let legacyCelldata: unknown = null;
  try {
    legacyCelldata = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : null;
  } catch {
    legacyCelldata = null;
  }
  const celldata = normalizeRendererCelldata(
    rawCelldata,
    legacyCelldata && Array.isArray(legacyCelldata) ? deserializeSheet(sheet).columns : [],
  );
  const cells = new Map(celldata.map((cell) => [`${cell.r},${cell.c}`, cell]));
  const merges: { row: [number, number]; col: [number, number] }[] = [];
  for (const object of objectRows) {
    const data = decodeDocumentJson<Record<string, unknown>>(object.data);
    const position = decodeDocumentJson<Record<string, unknown>>(object.position);
    if (
      object.type !== "custom" ||
      data.kind !== "merge" ||
      typeof position.startRow !== "number" ||
      typeof position.startCol !== "number" ||
      typeof position.endRow !== "number" ||
      typeof position.endCol !== "number"
    ) {
      continue;
    }
    const startRow = position.startRow;
    const startCol = position.startCol;
    const rowSpan = position.endRow - startRow + 1;
    const colSpan = position.endCol - startCol + 1;
    merges.push({
      row: [startRow, position.endRow],
      col: [startCol, position.endCol],
    });
    for (let row = startRow; row <= position.endRow; row += 1) {
      for (let col = startCol; col <= position.endCol; col += 1) {
        const key = `${row},${col}`;
        const current = cells.get(key) ?? { r: row, c: col, v: { v: "", m: "" } };
        current.v = {
          ...current.v,
          mc: { r: startRow, c: startCol, rs: rowSpan, cs: colSpan },
        };
        cells.set(key, current);
      }
    }
  }

  return {
    ...deserializeSheet(sheet),
    uploadedData: [...cells.values()].sort((left, right) => left.r - right.r || left.c - right.c),
    merges,
  };
}
