import * as repo from "./repository.js";

export async function getSheet(sheetId: number) {
  return repo.getSheet(sheetId);
}
