import * as repo from "./repository.js";

export async function deleteSheet(sheetId: number) {
  const sheet = await repo.findSheetWithWorkbook(sheetId);
  if (!sheet) return { error: "Sheet not found" };
  if (sheet.workbook.sheets.length <= 1) {
    return { error: "Workbook must keep at least one sheet" };
  }

  await repo.deleteSheetAndReindex(sheet.workbookId, sheetId);

  return { success: true, workbookId: sheet.workbookId };
}
