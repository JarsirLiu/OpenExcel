import * as repo from "./repository.js";

export async function deleteWorkbook(id: number) {
  const wb = await repo.findWorkbookWithSheets(id);
  if (!wb) return { error: "Workbook not found" };

  await repo.deleteWorkbook(id);
  return { success: true };
}
