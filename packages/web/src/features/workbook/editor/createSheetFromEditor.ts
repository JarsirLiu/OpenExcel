import { createSheet } from "@/api/workbooks";
import type { SheetCreatedUpdate } from "@/features/sync/types";

type CreateSheetFromEditorInput = {
  workspaceId: number;
  workbookId: number;
  name?: string;
};

export async function createSheetFromEditor({
  workspaceId,
  workbookId,
  name,
}: CreateSheetFromEditorInput): Promise<SheetCreatedUpdate> {
  const result = await createSheet(workspaceId, workbookId, { name });
  return {
    toolCallId: `ui-create-sheet:${workbookId}:${result.id}`,
    kind: "sheet-created",
    workbookId: result.workbookId,
    sheetId: result.id,
    sheetNo: result.sheetNo,
    sheetName: result.name,
    order: result.order,
    sourceSheetId: null,
  };
}
