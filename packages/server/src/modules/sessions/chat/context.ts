import { buildWorkspaceContext as buildAgentWorkspaceContext } from "@openexcel/agent";
import * as workbookRepo from "../../workbooks/infrastructure/workbookRepository.js";

export async function buildWorkspaceContext(workspaceId: number): Promise<string> {
  const workbooks = await workbookRepo.findWorkbooksWithSheets(workspaceId);
  return buildAgentWorkspaceContext(
    workbooks.map((workbook: (typeof workbooks)[number]) => ({
      id: workbook.id,
      name: workbook.name,
      sheets: workbook.sheets.map((sheet: (typeof workbook.sheets)[number]) => ({
        id: sheet.id,
        name: sheet.name,
      })),
    })),
  );
}
