import * as repo from "./repository.js";
import { deserializeSheet } from "../utils/sheetSerialization.js";

export async function getWorkbooks() {
  return repo.findWorkbooks();
}

export async function getReferenceCandidates() {
  const workbooks = await repo.findWorkbooksWithSheets();
  return workbooks.map((workbook) => ({
    id: workbook.id,
    name: workbook.name,
    sheets: workbook.sheets.map((sheet) => ({
      id: sheet.id,
      name: sheet.name,
    })),
  }));
}

export async function getWorkbook(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return null;
  return {
    id: wb.id,
    name: wb.name,
    sheets: wb.sheets.map((s) => deserializeSheet(s)),
  };
}
