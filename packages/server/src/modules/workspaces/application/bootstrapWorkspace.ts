import { exampleWorkspaceProvisioner } from "../infrastructure/exampleWorkspaceProvisioner.js";
import * as workspaceRepository from "../infrastructure/workspaceRepository.js";
import { ensureInitialWorkspace } from "./ensureInitialWorkspace.js";

export async function bootstrapWorkspace(ownerUserId: number) {
  await ensureInitialWorkspace(ownerUserId, exampleWorkspaceProvisioner);
  const workspaces = await workspaceRepository.findWorkspaces(ownerUserId);
  return workspaces[0] ?? null;
}
