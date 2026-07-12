import { prisma } from "../../../infra/database/db.js";
import { generateWorkbookPublicId } from "../../../shared/utils/publicId.js";
import {
  buildBlankSheetInitialization,
  buildSourceSheetInitialization,
  normalizeSheetName,
  normalizeWorkbookName,
  WorkbookCreationError,
} from "./creation.js";

export type CreateWorkbookResult = {
  id: number;
  publicId: string;
  name: string;
  order: number;
  sheets: number;
  initialSheet: {
    id: number;
    sheetNo: number;
    name: string;
    order: number;
  };
};

export async function createWorkbook(
  workspaceId: number,
  name?: string,
  sheetName?: string,
  sourceSheetId?: number,
): Promise<CreateWorkbookResult> {
  const workbookName = normalizeWorkbookName(name);
  const initialSheetName = normalizeSheetName(sheetName, 1);

  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workbook.aggregate({
      where: { workspaceId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workbook = await tx.workbook.create({
      data: {
        publicId: generateWorkbookPublicId(),
        workspaceId,
        name: workbookName,
        order: nextOrder,
      },
    });

    const sourceSheet =
      sourceSheetId == null
        ? null
        : await tx.sheet.findUnique({
            where: { id: sourceSheetId },
            include: { workbook: true, chunks: true, objects: true, formulaCells: true },
          });

    if (
      sourceSheetId != null &&
      (!sourceSheet || sourceSheet.workbook.workspaceId !== workspaceId)
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
        name: initialSheetName,
        order: 0,
        columns: payload.columns,
        merges: payload.merges,
        uploadedData: payload.uploadedData,
        config: payload.config ?? null,
        maxRow: payload.maxRow,
        maxColumn: payload.maxColumn,
      },
    });

    if (sourceSheet) {
      for (const chunk of sourceSheet.chunks) {
        await tx.sheetChunk.create({
          data: {
            sheetId: initialSheet.id,
            rowBlock: chunk.rowBlock,
            colBlock: chunk.colBlock,
            revision: 0,
            codec: chunk.codec,
            data: chunk.data,
          },
        });
      }
      for (const object of sourceSheet.objects) {
        await tx.sheetObject.create({
          data: {
            sheetId: initialSheet.id,
            type: object.type,
            position: object.position,
            data: object.data,
          },
        });
      }
      if (sourceSheet.formulaCells.length > 0) {
        await tx.formulaCell.createMany({
          data: sourceSheet.formulaCells.map((formulaCell) => ({
            sheetId: initialSheet.id,
            address: formulaCell.address,
            formula: formulaCell.formula,
            ast: formulaCell.ast,
            dependencies: formulaCell.dependencies,
            cachedValue: formulaCell.cachedValue,
          })),
        });
      }
    }

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
