import * as repo from "../repository.js";
import { buildBlankSheetInitialization, buildSourceSheetInitialization, normalizeSheetName, WorkbookCreationError } from "./creation.js";

export async function createSheet(workbookId: number, name?: string, sourceSheetId?: number) {
  const workbook = await repo.findWorkbookWithSheets(workbookId);
  if (!workbook) return null;

  const sourceSheet = sourceSheetId != null
    ? workbook.sheets.find((sheet) => sheet.id === sourceSheetId)
    : workbook.sheets[workbook.sheets.length - 1];

  if (sourceSheetId != null && !sourceSheet) {
    throw new WorkbookCreationError("源 Sheet 不存在", "SOURCE_SHEET_NOT_FOUND", 404);
  }

  const nextOrder = workbook.sheets.length;
  const nextName = normalizeSheetName(name, nextOrder + 1);
  const payload = sourceSheet
    ? buildSourceSheetInitialization(sourceSheet)
    : buildBlankSheetInitialization();

  const sheet = await repo.createSheet({
    workbookId,
    name: nextName,
    order: nextOrder,
    columns: payload.columns,
    merges: payload.merges,
    uploadedData: payload.uploadedData,
    config: payload.config,
  });

  return { workbookId, id: sheet.id, name: sheet.name, order: sheet.order };
}
