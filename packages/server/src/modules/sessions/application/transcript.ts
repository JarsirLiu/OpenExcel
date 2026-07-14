import * as repo from "../infrastructure/sessionRepository.js";
import type { findRunsBySession } from "../runs/repository.js";

export function historyFromRuns(runs: Awaited<ReturnType<typeof findRunsBySession>>) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return transcript;
}

export async function persistSessionMessages(
  workspaceId: number,
  sessionId: number,
  messages: any[],
) {
  await repo.updateSession(sessionId, { chatMessages: JSON.stringify(messages) }, workspaceId);
}

export async function getSessionMessages(workspaceId: number, sessionId: number): Promise<any[]> {
  const session: any = await repo.findSession(sessionId, workspaceId);
  if (!session) return [];
  try {
    return JSON.parse(session.chatMessages ?? "[]");
  } catch {
    return [];
  }
}

export async function getSessionMessagesPaginated(
  workspaceId: number,
  sessionId: number,
  limit: number,
  offset: number,
): Promise<{ messages: any[]; total: number }> {
  const all = await getSessionMessages(workspaceId, sessionId);
  const total = all.length;
  const start = Math.max(0, total - offset - limit);
  const end = total - offset;
  return { messages: all.slice(start, end), total };
}
