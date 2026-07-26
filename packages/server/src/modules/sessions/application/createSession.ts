import * as repo from "../infrastructure/sessionRepository.js";

export async function createSession(workspaceId: number) {
  return repo.createSession(workspaceId, "新对话");
}
