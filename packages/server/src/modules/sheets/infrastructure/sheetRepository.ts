import { prisma } from "../../../infra/database/db.js";
import { SheetRevisionConflictError } from "../domain/errors.js";

export type SheetSnapshotUpdate = {
  uploadedData: string;
  config?: string | null;
};

export async function findSheetForWorkspace(id: number, workspaceId: number) {
  const sheet = await prisma.sheet.findFirst({
    where: { id },
    include: { workbook: true },
  });
  if (!sheet) return null;
  if (sheet.workbook.workspaceId !== workspaceId) return null;
  return sheet;
}

export async function findSheetsForWorkbook(workbookId: number, workspaceId: number) {
  return prisma.sheet.findMany({
    where: { workbookId, workbook: { workspaceId } },
    select: { id: true, name: true },
    orderBy: { order: "asc" },
  });
}

export async function updateSheetData(
  sheetId: number,
  data: SheetSnapshotUpdate,
  baseRevision: number,
  workspaceId: number,
) {
  const sheet = await findSheetForWorkspace(sheetId, workspaceId);
  if (!sheet) return null;

  const result = await prisma.sheet.updateMany({
    where: { id: sheet.id, revision: baseRevision },
    data: {
      uploadedData: data.uploadedData,
      ...(Object.hasOwn(data, "config") ? { config: data.config ?? null } : {}),
      revision: { increment: 1 },
    },
  });
  if (result.count === 0) {
    throw new SheetRevisionConflictError(sheetId);
  }

  // The conditional update is atomic; this request is the one that increments
  // the revision, so a follow-up read would only introduce a response race.
  return { revision: baseRevision + 1 };
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

export async function findSheet(sheetId: number, workspaceId: number) {
  return findSheetForWorkspace(sheetId, workspaceId);
}
