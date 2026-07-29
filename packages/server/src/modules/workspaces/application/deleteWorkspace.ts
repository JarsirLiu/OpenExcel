import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";
import * as workspaceRepository from "../infrastructure/workspaceRepository.js";

export async function deleteWorkspace(id: number, ownerUserId: number) {
  const workspace = await workspaceRepository.findWorkspace(id, ownerUserId);
  if (!workspace) throw new WorkspaceNotFoundError();

  await workspaceRepository.deleteWorkspace(id);
  return { success: true };
}
