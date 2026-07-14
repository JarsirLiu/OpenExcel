import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export async function renameWorkspace(id: number, ownerUserId: number, name: string) {
  const trimmed = name?.trim();
  if (!trimmed) throw new WorkspaceNotFoundError("Name is required", 400);

  const workspace = await workspaceRepository.findWorkspace(id, ownerUserId);
  if (!workspace) throw new WorkspaceNotFoundError();

  return workspaceRepository.renameWorkspace(id, trimmed);
}
