const BASE = "/api";

export interface WorkbookMeta {
  id: number;
  name: string;
  order: number;
}

export interface SheetSchema {
  id: number;
  name: string;
  order: number;
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
  if (!res.ok) throw new Error("加载工作簿失败");
  return res.json();
}

export async function fetchWorkbook(id: number): Promise<WorkbookFull> {
  const res = await fetch(`${BASE}/workbooks/${id}`);
  if (!res.ok) throw new Error("加载工作簿详情失败");
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

export interface Message {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  changes: any[][] | null;
  createdAt: string;
}

export async function updateSheetData(sheetId: number, celldata: any[][]): Promise<void> {
  const res = await fetch(`${BASE}/sheets/${sheetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ celldata }),
  });
  if (!res.ok) throw new Error("保存失败");
}

export async function createSheet(workbookId: number, sourceSheetId?: number): Promise<{ id: number; name: string; order: number }> {
  const res = await fetch(`${BASE}/workbooks/${workbookId}/sheets`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceSheetId }),
  });
  if (!res.ok) throw new Error("创建 Sheet 失败");
  return res.json();
}

export async function deleteSheet(sheetId: number): Promise<void> {
  const res = await fetch(`${BASE}/sheets/${sheetId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("删除 Sheet 失败");
}

export async function fetchMessages(sheetId: number): Promise<Message[]> {
  const res = await fetch(`${BASE}/sheets/${sheetId}/messages`);
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function sendMessage(
  sheetId: number,
  role: string,
  content: string,
  changes?: any[][]
): Promise<Message> {
  const res = await fetch(`${BASE}/sheets/${sheetId}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, content, changes }),
  });
  if (!res.ok) throw new Error("发送消息失败");
  return res.json();
}

export async function chatWithAI(sheetId: number, prompt: string): Promise<Message> {
  const res = await fetch(`${BASE}/sheets/${sheetId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
  });
  if (!res.ok) throw new Error("AI 对话失败");
  return res.json();
}
