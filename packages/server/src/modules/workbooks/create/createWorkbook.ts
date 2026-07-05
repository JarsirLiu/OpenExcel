import { prisma } from "../../../infra/db.js";
import { normalizeSheetName, normalizeWorkbookName, buildBlankSheetInitialization, buildSourceSheetInitialization, WorkbookCreationError } from "./creation.js";

export type CreateWorkbookResult = {
  id: number;
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
        workspaceId,
        name: workbookName,
        order: nextOrder,
      },
    });

    const sourceSheet = sourceSheetId == null
      ? null
      : await tx.sheet.findUnique({
          where: { id: sourceSheetId },
          include: { workbook: true },
        });

    if (sourceSheetId != null && (!sourceSheet || sourceSheet.workbook.workspaceId !== workspaceId)) {
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
      },
    });

    return {
      id: workbook.id,
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
