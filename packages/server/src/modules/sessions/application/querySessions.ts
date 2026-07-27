import * as repo from "../infrastructure/sessionRepository.js";
import { findLatestSessionCheckpoint, findLatestSessionRun } from "../runs/checkpointRepository.js";
import { projectRunCheckpointForRun } from "../runs/sessionCheckpointProjector.js";

export async function getSessions(workspaceId: number) {
  return repo.findSessionsByWorkspace(workspaceId);
}

export async function deleteSession(workspaceId: number, sessionId: number) {
  return repo.deleteSession(sessionId, workspaceId);
}

export async function renameSession(workspaceId: number, sessionId: number, name: string) {
  return repo.updateSession(sessionId, { name, titleStatus: "manual" }, workspaceId);
}

export async function getSession(workspaceId: number, sessionId: number) {
  return repo.findSession(sessionId, workspaceId);
}

export async function getMessages(
  workspaceId: number,
  sessionId: number,
  limit = 40,
  offset = 0,
): Promise<{ messages: any[]; total: number }> {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) return { messages: [], total: 0 };

  const latestRun = await findLatestSessionRun(workspaceId, sessionId);
  if (latestRun) {
    await projectRunCheckpointForRun(workspaceId, sessionId, latestRun.id);
  }

  const checkpoint = await findLatestSessionCheckpoint(workspaceId, sessionId);
  const entries = checkpoint?.transcript as Array<{ message: unknown }> | undefined;
  if (!entries) return { messages: [], total: 0 };
  const transcript = entries.map((entry) => entry.message);
  const t = transcript.length;
  const start = Math.max(0, t - offset - limit);
  const end = t - offset;
  return { messages: transcript.slice(start, end), total: t };
}
