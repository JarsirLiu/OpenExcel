import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export async function listWorkspaces(ownerUserId: number) {
  return workspaceRepository.findWorkspaces(ownerUserId);
}
