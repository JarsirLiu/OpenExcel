import * as repo from "../infrastructure/workbookRepository.js";

export async function deleteSheet(workspaceId: number, workbookId: number, sheetId: number) {
  const workbook = await repo.findWorkbookWithSheets(workbookId, workspaceId);
  if (!workbook) return null;

  const sheet = workbook.sheets.find((item) => item.id === sheetId);
  if (!sheet) {
    return { error: "Sheet not found", statusCode: 404 as const };
  }

  if (workbook.sheets.length <= 1) {
    return { error: "Workbook must keep at least one sheet", statusCode: 409 as const };
  }

  await repo.deleteSheetAndReindex(workbookId, sheetId, workspaceId);

  return {
    success: true as const,
    workbookId,
    sheetId,
    sheetNo: sheet.sheetNo,
    order: sheet.order,
  };
}
