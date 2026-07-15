import type { WorkbookMeta } from "@/api/workbooks";

export function sortWorkbooks(list: WorkbookMeta[]): WorkbookMeta[] {
  return [...list].sort((a, b) => a.order - b.order || a.id - b.id);
}
