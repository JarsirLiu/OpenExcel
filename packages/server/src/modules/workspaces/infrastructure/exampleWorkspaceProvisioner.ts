import { gridToCelldata } from "@openexcel/core";
import { prisma } from "../../../infra/database/db.js";
import {
  generateSessionPublicId,
  generateWorkbookPublicId,
  generateWorkspacePublicId,
} from "../../../shared/utils/publicId.js";
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
        await tx.sheet.create({
          data: {
            workbookId: workbook.id,
            sheetNo: sheetIndex + 1,
            name: normalizeName(sheetDef.name, `Sheet${sheetIndex + 1}`),
            order: sheetIndex,
            columns: JSON.stringify(sheetDef.columns ?? []),
            merges: JSON.stringify(sheetDef.merges ?? []),
            uploadedData: JSON.stringify(gridToCelldata(sheetDef.rows ?? [])),
            config: null,
          },
        });
      }
    }

    await tx.session.create({
      data: {
        workspaceId: workspace.id,
        name: "新对话",
        sheetId: null,
        publicId: generateSessionPublicId(),
      },
    });

    return { seeded: true as const, workspaceId: workspace.id };
  });
}

export const exampleWorkspaceProvisioner = {
  provision: provisionExampleWorkspaceForUser,
};
