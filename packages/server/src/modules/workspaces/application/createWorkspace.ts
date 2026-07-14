import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export async function createWorkspace(ownerUserId: number, name?: string) {
  return workspaceRepository.createWorkspaceBundle(ownerUserId, name?.trim() || "新项目");
}

export async function ensureWorkspaceForUser(ownerUserId: number) {
  const workspaces = await workspaceRepository.findWorkspaces(ownerUserId);
  if (workspaces.length > 0) return workspaces[0];

  return createWorkspace(ownerUserId);
}
