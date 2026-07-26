import type { Prisma } from "../../../infra/database/prismaTypes.js";
import {
  buildBlankSheetInitialization,
  buildSourceSheetInitialization,
  normalizeSheetName,
  WorkbookCreationError,
} from "../domain/creation.js";
import * as repo from "../infrastructure/workbookRepository.js";

export async function createSheet(
  workspaceId: number,
  workbookId: number,
  name?: string,
  sourceSheetId?: number,
  db?: Prisma.TransactionClient,
) {
  const workbook = await repo.findWorkbookWithSheets(workbookId, workspaceId, db);
  if (!workbook) return null;

  const sourceSheet =
    sourceSheetId != null ? workbook.sheets.find((sheet) => sheet.id === sourceSheetId) : null;

  if (sourceSheetId != null && !sourceSheet) {
    throw new WorkbookCreationError("源 Sheet 不存在", "SOURCE_SHEET_NOT_FOUND", 404);
  }

  const nextOrder = workbook.sheets.length;
  const nextSheetNo = workbook.sheets.reduce((max, sheet) => Math.max(max, sheet.sheetNo), 0) + 1;
  const nextName = normalizeSheetName(name, nextSheetNo);
  const payload = sourceSheet
    ? buildSourceSheetInitialization(sourceSheet)
    : buildBlankSheetInitialization();

  const sheet = await repo.createSheet(
    {
      workbookId,
      sheetNo: nextSheetNo,
      name: nextName,
      order: nextOrder,
      columns: payload.columns,
      merges: payload.merges,
      uploadedData: payload.uploadedData,
      config: payload.config,
    },
    db,
  );

  return { workbookId, id: sheet.id, sheetNo: sheet.sheetNo, name: sheet.name, order: sheet.order };
}
