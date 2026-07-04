import * as repo from "./repository.js";

export async function getSheet(workspaceId: number, sheetId: number) {
  return repo.getSheet(sheetId, workspaceId);
}
