import * as repo from "./repository.js";

export async function persistSessionMessages(sessionId: number, messages: any[]) {
  await repo.updateSession(sessionId, { chatMessages: JSON.stringify(messages) });
}

export async function getSessionMessages(sessionId: number): Promise<any[]> {
  const session: any = await repo.findSession(sessionId);
  if (!session) return [];
  try {
    return JSON.parse(session.chatMessages ?? "[]");
  } catch {
    return [];
  }
}
