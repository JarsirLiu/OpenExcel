const BASE = "/api";

export interface WorkbookMeta {
  id: number;
  name: string;
  order: number;
}

export interface SheetSchema {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  rows: string[][];
  uploadedData: string[][] | null;
}

export interface WorkbookFull {
  id: number;
  name: string;
  sheets: SheetSchema[];
}

export async function fetchWorkbooks(): Promise<WorkbookMeta[]> {
  const res = await fetch(`${BASE}/workbooks`);
  return res.json();
}

export async function fetchWorkbook(id: number): Promise<WorkbookFull> {
  const res = await fetch(`${BASE}/workbooks/${id}`);
  return res.json();
}

export async function uploadExcel(workbookId: number, file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/workbooks/${workbookId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("上传失败");
}

export function downloadTemplateUrl(workbookId: number): string {
  return `${BASE}/workbooks/${workbookId}/template`;
}
