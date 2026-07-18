import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { generateWorkbookPublicId } from "../../../shared/utils/publicId.js";
import type { AssetRecord } from "../../assets/domain/asset.js";
import type { AssetImportActivator } from "../../assets/domain/assetRepository.js";
import {
  buildBlankSheetInitialization,
  buildSourceSheetInitialization,
  WorkbookCreationError,
} from "../domain/creation.js";

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

export async function findWorkbook(id: number, workspaceId: number) {
  return prisma.workbook.findFirst({ where: { id, workspaceId } });
}

export async function createWorkbookWithInitialSheet(input: {
  workspaceId: number;
  workbookName: string;
  initialSheetName: string;
  sourceSheetId?: number;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: input.workspaceId },
      data: { updatedAt: new Date() },
    });
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId: input.workspaceId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workbook = await tx.workbook.create({
      data: {
        publicId: generateWorkbookPublicId(),
        workspaceId: input.workspaceId,
        name: input.workbookName,
        order: nextOrder,
      },
    });

    const sourceSheet =
      input.sourceSheetId == null
        ? null
        : await tx.sheet.findUnique({
            where: { id: input.sourceSheetId },
            include: { workbook: true },
          });

    if (
      input.sourceSheetId != null &&
      (!sourceSheet || sourceSheet.workbook.workspaceId !== input.workspaceId)
    ) {
      throw new WorkbookCreationError("源 Sheet 不存在", "SOURCE_SHEET_NOT_FOUND", 404);
    }

    const payload = sourceSheet
      ? buildSourceSheetInitialization(sourceSheet)
      : buildBlankSheetInitialization();
    const initialSheet = await tx.sheet.create({
      data: {
        workbookId: workbook.id,
        sheetNo: 1,
        name: input.initialSheetName,
        order: 0,
        columns: payload.columns,
        merges: payload.merges,
        uploadedData: payload.uploadedData,
        config: payload.config ?? null,
      },
    });

    return {
      id: workbook.id,
      publicId: workbook.publicId,
      name: workbook.name,
      order: workbook.order,
      sheets: 1,
      initialSheet: {
        id: initialSheet.id,
        sheetNo: initialSheet.sheetNo,
        name: initialSheet.name,
        order: initialSheet.order,
      },
    };
  });
}

export async function createImportedWorkbooks(
  workspaceId: number,
  parsedWorkbooks: readonly {
    workbookName: string;
    sheetNames: readonly string[];
    results: readonly {
      celldata: unknown[];
      merges: unknown[];
      config?: unknown;
    }[];
  }[],
  sourceAsset?: AssetRecord,
  activateAsset?: AssetImportActivator,
) {
  return prisma.$transaction(async (tx) => {
    await tx.workspace.update({
      where: { id: workspaceId },
      data: { updatedAt: new Date() },
    });
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });
    let nextOrder = (maxOrder._max.order ?? -1) + 1;
    const uploaded = [];
    if (sourceAsset) {
      if (!activateAsset) throw new Error("导入资产激活器未提供");
      await activateAsset(tx, workspaceId, sourceAsset.id);
    }

    for (const parsedWorkbook of parsedWorkbooks) {
      const wb = await tx.workbook.create({
        data: {
          publicId: generateWorkbookPublicId(),
          workspaceId,
          name: parsedWorkbook.workbookName,
          order: nextOrder++,
          sourceAssetId: sourceAsset?.id,
        },
      });

      for (let index = 0; index < parsedWorkbook.sheetNames.length; index += 1) {
        const parsed = parsedWorkbook.results[index] ?? {
          celldata: [],
          merges: [],
          config: {},
        };
        await tx.sheet.create({
          data: {
            workbookId: wb.id,
            sheetNo: index + 1,
            name: parsedWorkbook.sheetNames[index],
            order: index,
            columns: JSON.stringify([]),
            merges: JSON.stringify(parsed.merges),
            uploadedData: JSON.stringify(parsed.celldata),
            config: JSON.stringify(parsed.config ?? {}),
          },
        });
      }

      uploaded.push({
        id: wb.id,
        publicId: wb.publicId,
        name: parsedWorkbook.workbookName,
        sheets: parsedWorkbook.sheetNames.length,
      });
    }

    return uploaded;
  });
}

export async function createSheet(data: {
  workbookId: number;
  sheetNo: number;
  name: string;
  order: number;
  columns: string;
  merges: string;
  uploadedData: string;
  config?: string;
}) {
  return prisma.sheet.create({
    data: {
      ...data,
      config: data.config ?? null,
    },
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
