import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeDocumentChunk,
  encodeDocumentJson,
  fortuneCelldataToChunks,
  gridToCelldata,
  type InitConfig,
} from "@openexcel/core";
import { prisma } from "../../infra/database/db.js";
import {
  generateSessionPublicId,
  generateWorkbookPublicId,
  generateWorkspacePublicId,
} from "../../shared/utils/publicId.js";

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

export async function seedExampleWorkspaceForUser(
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
        const celldata = gridToCelldata(sheetDef.rows ?? []);
        const sheet = await tx.sheet.create({
          data: {
            workbookId: workbook.id,
            sheetNo: sheetIndex + 1,
            name: normalizeName(sheetDef.name, `Sheet${sheetIndex + 1}`),
            order: sheetIndex,
            columns: JSON.stringify(sheetDef.columns ?? []),
            config: null,
            documentFormat: "openexcel-document-v1",
            documentVersion: 1,
            documentRevision: 0,
            maxRow: celldata.reduce((max, cell) => Math.max(max, cell.r + 1), 0),
            maxColumn: celldata.reduce((max, cell) => Math.max(max, cell.c + 1), 0),
          },
        });
        const chunks = fortuneCelldataToChunks(celldata, 0);
        for (const chunk of chunks.values()) {
          await tx.sheetChunk.create({
            data: {
              sheetId: sheet.id,
              rowBlock: chunk.rowBlock,
              colBlock: chunk.colBlock,
              revision: chunk.revision,
              ...encodeDocumentChunk(chunk.cells),
            },
          });
        }
        for (const merge of sheetDef.merges ?? []) {
          await tx.sheetObject.create({
            data: {
              sheetId: sheet.id,
              type: "custom",
              position: encodeDocumentJson({
                startRow: merge.row[0],
                startCol: merge.col[0],
                endRow: merge.row[1],
                endCol: merge.col[1],
              }),
              data: encodeDocumentJson({ kind: "merge" }),
            },
          });
        }
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

    await tx.user.update({
      where: { id: ownerUserId },
      data: { exampleWorkspaceSeededAt: now },
    });

    return { seeded: true as const, workspaceId: workspace.id };
  });
}
