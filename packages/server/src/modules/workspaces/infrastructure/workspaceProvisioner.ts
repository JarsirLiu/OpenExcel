import { prisma } from "../../../infra/database/db.js";
import {
  generateWorkbookPublicId,
  generateWorkspacePublicId,
} from "../../../shared/utils/publicId.js";
import {
  buildBlankSheetInitialization,
  normalizeWorkbookName,
} from "../../workbooks/domain/creation.js";

export async function provisionWorkspaceResources(ownerUserId: number, name: string) {
  return prisma.$transaction(async (tx) => {
    const maxOrder = await tx.workspace.aggregate({
      where: { ownerUserId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
        publicId: generateWorkspacePublicId(),
        ownerUserId,
        name,
        order: nextOrder,
      },
    });

    const workbook = await tx.workbook.create({
      data: {
        publicId: generateWorkbookPublicId(),
        workspaceId: workspace.id,
        name: normalizeWorkbookName(),
        order: 0,
      },
    });

    const sheetInitialization = buildBlankSheetInitialization();
    const initialSheet = await tx.sheet.create({
      data: {
        workbookId: workbook.id,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: sheetInitialization.columns,
        merges: sheetInitialization.merges,
        uploadedData: sheetInitialization.uploadedData,
        config: sheetInitialization.config ?? null,
      },
    });

    return {
      workspace,
      workbook: {
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
      },
    };
  });
}
