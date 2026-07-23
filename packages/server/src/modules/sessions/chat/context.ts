import type { WorkspaceWorkbookSummary } from "@openexcel/agent";
import * as workbookRepo from "../../workbooks/infrastructure/workbookRepository.js";

export async function loadWorkspaceChatContext(workspaceId: number): Promise<{
  workbooks: WorkspaceWorkbookSummary[];
}> {
  const workbooks = await workbookRepo.findWorkbooksWithSheets(workspaceId);
  const summaries = workbooks.map((workbook: (typeof workbooks)[number]) => ({
    id: workbook.id,
    name: workbook.name,
    sheets: workbook.sheets.map((sheet: (typeof workbook.sheets)[number]) => ({
      id: sheet.id,
      name: sheet.name,
      sheetNo: sheet.sheetNo,
    })),
  }));

  return {
    workbooks: summaries,
  };
}
