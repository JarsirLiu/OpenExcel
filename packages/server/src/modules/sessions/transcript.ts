import * as repo from "./repository.js";

export async function persistSessionMessages(workspaceId: number, sessionId: number, messages: any[]) {
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
  workspaceId: number, sessionId: number, limit: number, offset: number,
): Promise<{ messages: any[]; total: number }> {
  const all = await getSessionMessages(workspaceId, sessionId);
  const total = all.length;
  const start = Math.max(0, total - offset - limit);
  const end = total - offset;
  return { messages: all.slice(start, end), total };
}
