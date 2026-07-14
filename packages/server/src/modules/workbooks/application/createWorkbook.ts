import { normalizeSheetName, normalizeWorkbookName } from "../domain/creation.js";
import * as repo from "../infrastructure/workbookRepository.js";

export type CreateWorkbookResult = {
  id: number;
  publicId: string;
  name: string;
  order: number;
  sheets: number;
  initialSheet: {
    id: number;
    sheetNo: number;
    name: string;
    order: number;
  };
};

export async function createWorkbook(
  workspaceId: number,
  name?: string,
  sheetName?: string,
  sourceSheetId?: number,
): Promise<CreateWorkbookResult> {
  const workbookName = normalizeWorkbookName(name);
  const initialSheetName = normalizeSheetName(sheetName, 1);

  return repo.createWorkbookWithInitialSheet({
    workspaceId,
    workbookName,
    initialSheetName,
    sourceSheetId,
  });
}
