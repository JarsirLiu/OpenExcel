import * as repo from "./repository.js";
import * as runRepo from "./runs/repository.js";
import { historyFromRuns } from "./chat/index.js";
import { getSessionMessages } from "./transcript.js";

export async function getSessions(workspaceId: number) {
  return repo.findSessionsByWorkspace(workspaceId);
}

export async function createSession(workspaceId: number) {
  return repo.createSession(workspaceId, "新对话");
}

export async function deleteSession(workspaceId: number, sessionId: number) {
  return repo.deleteSession(sessionId, workspaceId);
}

export async function renameSession(workspaceId: number, sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name }, workspaceId);
}

export async function getSession(workspaceId: number, sessionId: number) {
  return repo.findSession(sessionId, workspaceId);
}

export async function getMessages(workspaceId: number, sessionId: number) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) return [];
  const storedMessages = await getSessionMessages(workspaceId, sessionId);
  if (storedMessages.length > 0) return storedMessages;

  const runs = await runRepo.findRunsBySession(workspaceId, sessionId);
  return historyFromRuns(runs);
}

export async function getRuns(workspaceId: number, sessionId: number) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) return [];
  const runs = await runRepo.findRunsBySession(workspaceId, sessionId);
  const steps = await Promise.all(runs.map(async (run: (typeof runs)[number]) => ({
    ...run,
    steps: await runRepo.findStepsByRun(run.id),
  })));
  return steps;
}
