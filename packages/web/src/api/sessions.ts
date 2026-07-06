import { apiFetch, readErrorMessage } from "./http";

export interface Session {
  id: number;
  publicId: string;
  sheetId: number | null;
  name: string;
  createdAt: string;
}

export async function fetchSessions(workspaceId: number): Promise<Session[]> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions`);
  if (!res.ok) throw new Error("加载会话失败");
  return res.json();
}

export async function createSession(workspaceId: number): Promise<Session> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions`, { method: "POST" });
  if (!res.ok) throw new Error("创建会话失败");
  return res.json();
}

export async function deleteSession(workspaceId: number, id: number): Promise<void> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除会话失败");
}

export async function renameSession(workspaceId: number, id: number, name: string): Promise<Session> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("重命名会话失败");
  return res.json();
}

export async function generateSessionTitle(workspaceId: number, sessionId: number, firstUserText: string): Promise<{ title: string }> {
  const res = await apiFetch(`/workspaces/${workspaceId}/sessions/${sessionId}/title`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ firstUserText }),
  });
  if (!res.ok) throw new Error(await readErrorMessage(res, "生成标题失败"));
  return res.json();
}
