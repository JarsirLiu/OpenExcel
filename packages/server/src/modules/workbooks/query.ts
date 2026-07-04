import * as repo from "./repository.js";
import { deserializeSheet } from "../../shared/utils/sheetSerialization.js";

export async function getWorkbooks(workspaceId: number) {
  return repo.findWorkbooks(workspaceId);
}

export async function getReferenceCandidates(workspaceId: number) {
  const workbooks = await repo.findWorkbooksWithSheets(workspaceId);
  return workbooks.map((workbook) => ({
    id: workbook.id,
    name: workbook.name,
    sheets: workbook.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
    })),
  }));
}

export async function getWorkbook(id: number, workspaceId: number) {
  const wb = await repo.findWorkbookWithSheets(id, workspaceId);
  if (!wb) return null;
  return {
    id: wb.id,
    name: wb.name,
    sheets: wb.sheets.map((s) => deserializeSheet(s)),
  };
}
