const BASE = "/api";

type ApiErrorResponse = {
  error?: unknown;
};

function isApiErrorResponse(value: unknown): value is ApiErrorResponse {
  return typeof value === "object" && value !== null && "error" in value;
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  try {
    const data: unknown = await res.json();
    if (isApiErrorResponse(data) && typeof data.error === "string") {
      return data.error;
    }
  } catch {
    // ignore parse failures and fall back to the generic message
  }
  return fallback;
}

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
  uploadedData: any[] | null;
  config: any | null;
}

export interface WorkbookFull {
  id: number;
  name: string;
  sheets: SheetSchema[];
}

export interface WorkbookImportResult {
  success: true;
  workbookId: number;
  workbookName: string;
  updatedSheets: { id: number; name: string; rows: number; cols: number }[];
  skippedCurrentSheets: string[];
  ignoredUploadedSheets: string[];
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

export async function uploadExcel(workbookId: number, file: File): Promise<WorkbookImportResult> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/workbooks/${workbookId}/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "导入失败"));
  return res.json();
}

export async function uploadNewWorkbook(file: File): Promise<{ id: number; name: string; sheets: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/workbooks/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "上传工作簿失败"));
  return res.json();
}

export function downloadTemplateUrl(workbookId: number): string {
  return `${BASE}/workbooks/${workbookId}/template`;
}

export async function updateSheetData(sheetId: number, celldata: any[], config?: any): Promise<void> {
  const body: any = { celldata };
  if (config !== undefined) body.config = config;
  const res = await fetch(`${BASE}/sheets/${sheetId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
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

export async function deleteWorkbook(id: number): Promise<void> {
  const res = await fetch(`${BASE}/workbooks/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除工作簿失败");
}

export async function deleteSheet(sheetId: number): Promise<void> {
  const res = await fetch(`${BASE}/sheets/${sheetId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("删除 Sheet 失败");
}

export interface Session {
  id: number;
  sheetId: number | null;
  name: string;
  createdAt: string;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await fetch(`${BASE}/sessions`);
  if (!res.ok) throw new Error("加载会话失败");
  return res.json();
}

export async function createSession(): Promise<Session> {
  const res = await fetch(`${BASE}/sessions`, { method: "POST" });
  if (!res.ok) throw new Error("创建会话失败");
  return res.json();
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除会话失败");
}

export async function renameSession(id: number, name: string): Promise<Session> {
  const res = await fetch(`${BASE}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("重命名会话失败");
  return res.json();
}

export async function fetchMessages(sessionId: number): Promise<any[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function fetchRuns(sessionId: number): Promise<any[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/runs`);
  if (!res.ok) throw new Error("加载运行日志失败");
  return res.json();
}

export async function undoLatestRun(sessionId: number): Promise<{ runId: number; restoredSheetIds: number[] }> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/runs/undo-latest`, {
    method: "POST",
  });
  if (!res.ok) throw new Error("撤销本轮修改失败");
  return res.json();
}
