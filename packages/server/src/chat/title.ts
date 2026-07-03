import { generateText, type LanguageModel } from "ai";
import { createTitleModel } from "./model.js";

/**
 * Generate a session title and persist it separately from chat execution.
 */
export async function generateSessionTitle(
  updateSession: (id: number, data: { name?: string }) => Promise<unknown>,
  sessionId: number,
  firstUserText: string,
): Promise<string> {
  const title = await generateTitle(createTitleModel(), firstUserText);
  await updateSession(sessionId, { name: title });
  return title;
}

export async function generateTitle(model: LanguageModel, prompt: string): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      prompt: `请为下面这条用户消息生成一个不超过10个汉字的会话标题，只输出标题，不要解释，不要加引号，不要输出思考过程。\n\n用户消息：${prompt}`,
      maxOutputTokens: 32,
      temperature: 0,
    });

    const cleaned = stripThinkingTags(text || "").replace(/\s+/g, " ").trim();
    if (cleaned) {
      return cleaned.slice(0, 10);
    }
  } catch (error) {
    console.error("[chat] Failed to generate title from model, falling back:", error);
  }

  return fallbackTitleFromPrompt(prompt);
}

function stripThinkingTags(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<\/?think>/gi, "");
}

function fallbackTitleFromPrompt(prompt: string): string {
  const fallback = prompt.replace(/\s+/g, " ").trim().slice(0, 10);
  return fallback || "新对话";
}
