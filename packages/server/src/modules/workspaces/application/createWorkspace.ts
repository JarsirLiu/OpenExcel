import { provisionWorkspaceResources } from "../infrastructure/workspaceProvisioner.js";

export async function createWorkspace(ownerUserId: number, name?: string) {
  const workspaceName = name?.trim() || "新项目";
  return provisionWorkspaceResources(ownerUserId, workspaceName);
}
