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
  uploadedData: any[] | null;
  config: any | null;
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

export async function uploadNewWorkbook(file: File): Promise<{ id: number; name: string; sheets: number }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/workbooks/upload`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) throw new Error("上传工作簿失败");
  return res.json();
}

export function downloadTemplateUrl(workbookId: number): string {
  return `${BASE}/workbooks/${workbookId}/template`;
}

export interface Message {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  reasoning?: string;
}

export interface AgentRunEvent {
  event: "run.started" | "step.started" | "step.completed" | "step.delta" | "run.completed" | "run.failed" | "run.aborted";
  data: any;
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

export async function fetchMessages(sessionId: number): Promise<Message[]> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/messages`);
  if (!res.ok) throw new Error("加载消息失败");
  return res.json();
}

export async function streamChat(
  sessionId: number,
  input: string,
  onEvent: (event: AgentRunEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(`${BASE}/sessions/${sessionId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error("聊天流启动失败");
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  const flush = () => {
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const lines = part.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      if (!eventLine || !dataLine) continue;
      const event = eventLine.slice(7).trim() as AgentRunEvent["event"];
      const data = JSON.parse(dataLine.slice(6));
      onEvent({ event, data });
    }
  };

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    flush();
  }

  buffer += decoder.decode();
  flush();
}
