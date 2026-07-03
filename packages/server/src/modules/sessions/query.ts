import * as repo from "./repository.js";
import * as runRepo from "./runRepository.js";
import { historyFromRuns } from "./context.js";
import { getSessionMessages } from "./transcript.js";

export async function getSessions() {
  return repo.findGlobalSessions();
}

export async function createSession() {
  return repo.createSession("新对话");
}

export async function deleteSession(sessionId: number) {
  return repo.deleteSession(sessionId);
}

export async function renameSession(sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name });
}

export async function getSession(sessionId: number) {
  return repo.findSession(sessionId);
}

export async function getMessages(sessionId: number) {
  const storedMessages = await getSessionMessages(sessionId);
  if (storedMessages.length > 0) return storedMessages;

  const runs = await runRepo.findRunsBySession(sessionId);
  return historyFromRuns(runs);
}

export async function getRuns(sessionId: number) {
  const runs = await runRepo.findRunsBySession(sessionId);
  const steps = await Promise.all(runs.map(async (run) => ({
    ...run,
    steps: await runRepo.findStepsByRun(run.id),
  })));
  return steps;
}
