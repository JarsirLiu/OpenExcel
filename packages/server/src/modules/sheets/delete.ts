import * as repo from "./repository.js";

export async function deleteSheet(workspaceId: number, sheetId: number) {
  const sheet = await repo.findSheetWithWorkbook(sheetId, workspaceId);
  if (!sheet) return { error: "Sheet not found" };
  if (sheet.workbook.sheets.length <= 1) {
    return { error: "Workbook must keep at least one sheet" };
  }

  await repo.deleteSheetAndReindex(sheet.workbookId, sheetId, workspaceId);

  return { success: true, workbookId: sheet.workbookId };
}
