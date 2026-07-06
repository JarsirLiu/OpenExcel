import { apiFetch } from "./http";

export interface Workspace {
  id: number;
  name: string;
  order: number;
}

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await apiFetch("/workspaces");
  if (!res.ok) throw new Error("加载工作区失败");
  return res.json();
}

export async function fetchWorkspace(id: number): Promise<Workspace> {
  const res = await apiFetch(`/workspaces/${id}`);
  if (!res.ok) throw new Error("加载工作区失败");
  return res.json();
}

export async function createWorkspace(name?: string): Promise<Workspace> {
  const res = await apiFetch("/workspaces", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("创建项目失败");
  const data = await res.json();
  return data.workspace ?? data;
}

export async function renameWorkspace(id: number, name: string): Promise<Workspace> {
  const res = await apiFetch(`/workspaces/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  if (!res.ok) throw new Error("修改项目名称失败");
  return res.json();
}

export async function deleteWorkspace(id: number): Promise<void> {
  const res = await apiFetch(`/workspaces/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error("删除项目失败");
}
