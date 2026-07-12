import { chunksToFortuneCelldata, decodeDocumentChunk, decodeDocumentJson } from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";
import { deserializeSheetMetadata } from "../../shared/utils/sheetSerialization.js";
import { loadCellStyles } from "../documents/styleRegistry.js";

export async function findSheetWithWorkbook(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: { include: { sheets: { orderBy: { order: "asc" } } } } },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return sheet;
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

export async function readSheetForExport(sheetId: number, workspaceId: number) {
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
    cells: decodeDocumentChunk(row.data, row.codec).cells,
    rowBlock: row.rowBlock,
    colBlock: row.colBlock,
    revision: row.revision,
    codec: row.codec as "json-v1" | "json-gzip-v1",
  }));
  const styleIds = chunks.flatMap((chunk) =>
    Object.values(chunk.cells).flatMap((cell) => (cell.styleId ? [cell.styleId] : [])),
  );
  const styles = await loadCellStyles(prisma, sheet.workbookId, styleIds);
  const rawCelldata = chunksToFortuneCelldata(chunks, {}, styles);
  const cells = new Map(rawCelldata.map((cell) => [`${cell.r},${cell.c}`, cell]));
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
    ...deserializeSheetMetadata(sheet),
    celldata: [...cells.values()].sort((left, right) => left.r - right.r || left.c - right.c),
    merges,
  };
}
