import { prisma } from "../../../infra/database/db.js";
import {
  generateWorkbookPublicId,
  generateWorkspacePublicId,
} from "../../../shared/utils/publicId.js";
import { buildExampleSheetPersistence } from "./exampleSheetPersistence.js";
import { loadExampleTemplate } from "./exampleTemplateReader.js";

function normalizeName(name: string | undefined, fallback: string) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export async function provisionExampleWorkspaceForUser(
  ownerUserId: number,
  template = loadExampleTemplate(),
) {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: ownerUserId },
      select: {
        id: true,
        exampleWorkspaceSeededAt: true,
        workspaces: {
          select: { id: true },
          take: 1,
        },
      },
    });

    if (!user) {
      return null;
    }

    const now = new Date();

    if (user.exampleWorkspaceSeededAt) {
      return { seeded: false as const };
    }

    if (user.workspaces.length > 0) {
      await tx.user.update({
        where: { id: ownerUserId },
        data: { exampleWorkspaceSeededAt: now },
      });

      return { seeded: false as const };
    }

    const claim = await tx.user.updateMany({
      where: {
        id: ownerUserId,
        exampleWorkspaceSeededAt: null,
      },
      data: { exampleWorkspaceSeededAt: now },
    });

    if (claim.count !== 1) {
      return { seeded: false as const };
    }

    const maxOrder = await tx.workspace.aggregate({
      where: { ownerUserId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
        ownerUserId,
        name: "示例项目",
        order: nextOrder,
        publicId: generateWorkspacePublicId(),
      },
    });

    for (const [workbookIndex, workbookDef] of template.workbooks.entries()) {
      const workbook = await tx.workbook.create({
        data: {
          workspaceId: workspace.id,
          name: normalizeName(workbookDef.name, `Workbook ${workbookIndex + 1}`),
          order: workbookIndex,
          publicId: generateWorkbookPublicId(),
        },
      });

      for (const [sheetIndex, sheetDef] of workbookDef.sheets.entries()) {
        const sheetData = buildExampleSheetPersistence(sheetDef);
        await tx.sheet.create({
          data: {
            workbookId: workbook.id,
            sheetNo: sheetIndex + 1,
            name: normalizeName(sheetDef.name, `Sheet${sheetIndex + 1}`),
            order: sheetIndex,
            columns: sheetData.columns,
            merges: sheetData.merges,
            uploadedData: sheetData.uploadedData,
            config: null,
          },
        });
      }
    }

    return { seeded: true as const, workspaceId: workspace.id };
  });
}

export const exampleWorkspaceProvisioner = {
  provision: provisionExampleWorkspaceForUser,
};
