import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export async function deleteWorkspace(id: number, ownerUserId: number) {
  const workspace = await workspaceRepository.findWorkspace(id, ownerUserId);
  if (!workspace) throw new WorkspaceNotFoundError();

  const count = await workspaceRepository.countWorkspaces(ownerUserId);
  if (count <= 1) {
    throw new WorkspaceNotFoundError("Cannot delete the last workspace", 400);
  }

  await workspaceRepository.deleteWorkspace(id);
  return { success: true };
}
