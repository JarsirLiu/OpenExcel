import { apiFetch } from "./http";

export interface Workspace {
  id: number;
  publicId: string;
  name: string;
  order: number;
}

const bootstrapWorkspaceRequests = new Map<number, Promise<Workspace>>();

export async function fetchWorkspaces(): Promise<Workspace[]> {
  const res = await apiFetch("/workspaces");
  if (!res.ok) throw new Error("加载工作区失败");
  return res.json();
}

export async function bootstrapWorkspace(userId: number): Promise<Workspace> {
  const existingRequest = bootstrapWorkspaceRequests.get(userId);
  if (existingRequest) return existingRequest;

  const request = requestBootstrapWorkspace();
  bootstrapWorkspaceRequests.set(userId, request);
  try {
    return await request;
  } finally {
    if (bootstrapWorkspaceRequests.get(userId) === request) {
      bootstrapWorkspaceRequests.delete(userId);
    }
  }
}

async function requestBootstrapWorkspace(): Promise<Workspace> {
  const res = await apiFetch("/workspaces/bootstrap", { method: "POST" });
  if (!res.ok) throw new Error("工作区初始化失败，请重试");
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
