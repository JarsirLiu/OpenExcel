import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import * as repo from "../infrastructure/workbookRepository.js";

export async function getWorkbooks(workspaceId: number) {
  return repo.findWorkbooks(workspaceId);
}

export async function getReferenceCandidates(workspaceId: number) {
  const workbooks = await repo.findWorkbooksWithSheets(workspaceId);
  return workbooks.map((workbook) => ({
    id: workbook.id,
    publicId: workbook.publicId,
    name: workbook.name,
    sheets: workbook.sheets.map((sheet) => ({
      id: sheet.id,
      sheetNo: sheet.sheetNo,
      name: sheet.name,
    })),
  }));
}

export async function getWorkbook(id: number, workspaceId: number) {
  const wb = await repo.findWorkbookWithSheets(id, workspaceId);
  if (!wb) return null;
  return {
    id: wb.id,
    publicId: wb.publicId,
    name: wb.name,
    sheets: wb.sheets.map((s) => deserializeSheet(s)),
  };
}

export async function renameWorkbook(id: number, name: string, workspaceId: number) {
  const wb = await repo.updateWorkbookName(id, name, workspaceId);
  if (!wb) return null;
  return { id: wb.id, publicId: wb.publicId, name: wb.name };
}
