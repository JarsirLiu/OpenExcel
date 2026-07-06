import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { gridToCelldata, type InitConfig } from "@openexcel/core";
import { generateSessionPublicId, generateWorkbookPublicId, generateWorkspacePublicId } from "../../shared/utils/publicId.js";
import { prisma } from "../../infra/database/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const exampleTemplatePath = resolve(__dirname, "../../../../../templates/init.json");

function loadExampleTemplate(): InitConfig {
  const raw = readFileSync(exampleTemplatePath, "utf-8");
  return JSON.parse(raw) as InitConfig;
}

function normalizeName(name: string | undefined, fallback: string) {
  const trimmed = name?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : fallback;
}

export async function seedExampleWorkspaceForUser(ownerUserId: number, template = loadExampleTemplate()) {
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

    const maxOrder = await tx.workspace.aggregate({
      where: { ownerUserId },
      _max: { order: true },
    });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;

    const workspace = await tx.workspace.create({
      data: {
        ownerUserId,
        publicId: generateWorkspacePublicId(),
        name: "示例工作区",
        order: nextOrder,
      },
    });

    for (const [workbookIndex, workbookDef] of template.workbooks.entries()) {
      const workbook = await tx.workbook.create({
        data: {
          workspaceId: workspace.id,
          publicId: generateWorkbookPublicId(),
          name: normalizeName(workbookDef.name, `Workbook ${workbookIndex + 1}`),
          order: workbookIndex,
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
        publicId: generateSessionPublicId(),
        name: "新对话",
        sheetId: null,
      },
    });

    await tx.user.update({
      where: { id: ownerUserId },
      data: { exampleWorkspaceSeededAt: now },
    });

    return { seeded: true as const, workspaceId: workspace.id };
  });
}
