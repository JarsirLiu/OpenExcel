import * as repo from "./repository.js";
import * as context from "./context.js";
import * as msg from "./messages.js";
import * as model from "./model.js";

export async function getSessions(sheetId: number) {
  return repo.findSessionsBySheet(sheetId);
}

export async function createSession(sheetId: number) {
  const count = await repo.findSessionsBySheet(sheetId);
  const name = `会话 ${count.length + 1}`;
  return repo.createSession(sheetId, name);
}

export async function deleteSession(sessionId: number) {
  return repo.deleteSession(sessionId);
}

export async function getMessages(sessionId: number) {
  const messages = await repo.findMessagesBySession(sessionId);
  return messages.map((m) => ({
    id: String(m.id),
    role: m.role,
    content: m.content,
  }));
}

export async function chat(sessionId: number, incomingMessages: any[]) {
  const session = await repo.findSession(sessionId);
  if (!session) return { error: "Session not found" };

  const sheet = await repo.findSheet(session.sheetId);
  if (!sheet) return { error: "Sheet not found" };

  const lastUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg ? msg.getMessageText(lastUserMsg) : "";

  // 先保存用户消息，再读历史（包含刚保存的那条）
  await repo.createMessage(sessionId, "user", userText);

  const systemPrompt = await context.buildSystemPrompt(userText);

  const history = await repo.findMessagesBySession(sessionId);
  const trimmedHistory = msg.limitTurns(
    history.map((m) => ({ role: m.role, content: m.content }))
  );

  const result = model.streamChat(systemPrompt, trimmedHistory, async (text) => {
    await repo.createMessage(sessionId, "assistant", text);
  });

  return { result };
}