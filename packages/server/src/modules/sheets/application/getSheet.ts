import { deserializeSheet } from "../../../shared/utils/sheetSerialization.js";
import * as repo from "../infrastructure/sheetRepository.js";

export async function getSheet(workspaceId: number, sheetId: number) {
  const sheet = await repo.findSheet(sheetId, workspaceId);
  return sheet ? deserializeSheet(sheet) : null;
}
