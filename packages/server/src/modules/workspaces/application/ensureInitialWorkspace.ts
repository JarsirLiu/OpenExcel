import { provisionExampleWorkspaceForUser } from "../infrastructure/exampleWorkspaceProvisioner.js";

export async function ensureInitialWorkspace(ownerUserId: number) {
  return provisionExampleWorkspaceForUser(ownerUserId);
}
