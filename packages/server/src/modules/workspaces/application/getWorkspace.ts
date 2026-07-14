import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export function getWorkspaceById(id: number) {
  return workspaceRepository.findWorkspaceById(id);
}

export async function requireWorkspace(id: number, ownerUserId: number) {
  const workspace = await workspaceRepository.findWorkspace(id, ownerUserId);
  if (!workspace) throw new WorkspaceNotFoundError();
  return workspace;
}
