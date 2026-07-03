import { apiFetch, readErrorMessage } from "./http";

export interface Session {
  id: number;
  sheetId: number | null;
  name: string;
  createdAt: string;
}

export async function fetchSessions(): Promise<Session[]> {
  const res = await apiFetch("/sessions");
  if (!res.ok) throw new Error("加载会话失败");
  return res.json();
}

export async function createSession(): Promise<Session> {
  const res = await apiFetch("/sessions", { method: "POST" });
  if (!res.ok) throw new Error("创建会话失败");
  return res.json();
}

export async function deleteSession(id: number): Promise<void> {
  const res = await apiFetch(`/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除会话失败");
}

export async function renameSession(id: number, name: string): Promise<Session> {
  const res = await apiFetch(`/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("重命名会话失败");
  return res.json();
}

export async function generateSessionTitle(sessionId: number, firstUserText: string): Promise<{ title: string }> {
  const res = await apiFetch(`/sessions/${sessionId}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstUserText }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "生成标题失败"));
  return res.json();
}
