import { prisma } from "../../infra/database/db.js";
import type { Prisma } from "../../infra/database/prismaTypes.js";

export async function findWorkbooks(workspaceId: number): Promise<Prisma.WorkbookGetPayload<{}>[]> {
  return prisma.workbook.findMany({
    where: { workspaceId },
    orderBy: { order: "asc" },
  });
}

export async function findWorkbooksWithSheets(workspaceId: number) {
  return prisma.workbook.findMany({
    where: { workspaceId },
    orderBy: { order: "asc" },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
}

export async function findWorkbookWithSheets(id: number, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({
    where: { id, workspaceId },
    include: { sheets: { orderBy: { order: "asc" } } },
  });
  return workbook;
}

export async function findWorkbookWithSheetMetadata(id: number, workspaceId: number) {
  return prisma.workbook.findFirst({
    where: { id, workspaceId },
    select: {
      id: true,
      publicId: true,
      name: true,
      sheets: {
        orderBy: { order: "asc" },
        select: {
          id: true,
          sheetNo: true,
          name: true,
          order: true,
          columns: true,
          config: true,
          documentFormat: true,
          documentVersion: true,
          documentRevision: true,
          maxRow: true,
          maxColumn: true,
        },
      },
    },
  });
}

export async function findWorkbook(id: number, workspaceId: number) {
  return prisma.workbook.findFirst({ where: { id, workspaceId } });
}

export async function createSheet(data: {
  workbookId: number;
  sheetNo: number;
  name: string;
  order: number;
  columns: string;
  config?: string;
  maxRow: number;
  maxColumn: number;
}) {
  return prisma.sheet.create({
    data: {
      ...data,
      config: data.config ?? null,
    },
  });
}

export async function copySheetDocument(sourceSheetId: number, targetSheetId: number) {
  const [chunks, objects, formulaDependencies] = await Promise.all([
    prisma.sheetChunk.findMany({ where: { sheetId: sourceSheetId } }),
    prisma.sheetObject.findMany({ where: { sheetId: sourceSheetId } }),
    prisma.formulaDependency.findMany({ where: { targetSheetId: sourceSheetId } }),
  ]);
  const formulaCells = await prisma.formulaCell.findMany({ where: { sheetId: sourceSheetId } });
  await prisma.$transaction(async (tx) => {
    for (const chunk of chunks) {
      await tx.sheetChunk.create({
        data: {
          sheetId: targetSheetId,
          rowBlock: chunk.rowBlock,
          colBlock: chunk.colBlock,
          revision: 0,
          codec: chunk.codec,
          data: chunk.data,
        },
      });
    }
    for (const object of objects) {
      await tx.sheetObject.create({
        data: {
          sheetId: targetSheetId,
          type: object.type,
          position: object.position,
          data: object.data,
        },
      });
    }
    if (formulaCells.length > 0) {
      await tx.formulaCell.createMany({
        data: formulaCells.map((formulaCell) => ({
          sheetId: targetSheetId,
          row: formulaCell.row,
          col: formulaCell.col,
          address: formulaCell.address,
          formula: formulaCell.formula,
          ast: formulaCell.ast,
          dependencies: formulaCell.dependencies,
          cachedValue: formulaCell.cachedValue,
        })),
      });
    }
    if (formulaDependencies.length > 0) {
      await tx.formulaDependency.createMany({
        data: formulaDependencies.map((dependency) => ({
          sourceSheetId:
            dependency.sourceSheetId === sourceSheetId ? targetSheetId : dependency.sourceSheetId,
          targetSheetId,
          targetAddress: dependency.targetAddress,
          startRow: dependency.startRow,
          startCol: dependency.startCol,
          endRow: dependency.endRow,
          endCol: dependency.endCol,
        })),
      });
    }
  });
}

export async function deleteSheetAndReindex(
  workbookId: number,
  sheetId: number,
  workspaceId: number,
) {
  return prisma.$transaction(async (tx) => {
    const workbook = await tx.workbook.findFirst({ where: { id: workbookId, workspaceId } });
    if (!workbook) return;

    await tx.sheet.delete({ where: { id: sheetId } });
    const sheets = await tx.sheet.findMany({
      where: { workbookId },
      orderBy: { order: "asc" },
    });
    for (let index = 0; index < sheets.length; index += 1) {
      const sheet = sheets[index];
      await tx.sheet.update({
        where: { id: sheet.id },
        data: { order: index, sheetNo: index + 1 },
      });
    }
  });
}

export async function updateWorkbookName(id: number, name: string, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({ where: { id, workspaceId } });
  if (!workbook) return null;
  return prisma.workbook.update({ where: { id }, data: { name } });
}

export async function deleteWorkbook(id: number, workspaceId: number) {
  const workbook = await prisma.workbook.findFirst({ where: { id, workspaceId } });
  if (!workbook) return null;
  return prisma.workbook.delete({ where: { id: workbook.id } });
}
