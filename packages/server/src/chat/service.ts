import * as repo from "./repository.js";
import * as context from "./context.js";
import * as msg from "./messages.js";
import * as model from "./model.js";

export async function getMessages(sheetId: number) {
  const messages = await repo.findMessagesBySheet(sheetId);
  return messages.map((m) => ({
    id: String(m.id),
    role: m.role,
    content: m.content,
  }));
}

export async function chat(sheetId: number, incomingMessages: any[]) {
  const sheet = await repo.findSheet(sheetId);
  if (!sheet) return { error: "Sheet not found" };

  const lastUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg ? msg.getMessageText(lastUserMsg) : "";

  const systemPrompt = await context.buildSystemPrompt(userText);
  const cleanedMessages = msg.cleanMessages(incomingMessages);

  await repo.createMessage(sheetId, "user", userText);

  const result = model.streamChat(systemPrompt, cleanedMessages, async (text) => {
    await repo.createMessage(sheetId, "assistant", text);
  });

  return { result };
}