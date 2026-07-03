import { generateText, type LanguageModel } from "ai";
import { createTitleModel, type ModelConfig } from "@openexcel/agent";
import * as repo from "./repository.js";
import { loadModelConfig } from "../../config.js";

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
    console.error("[server] Failed to generate title from model, falling back:", error);
  }

  return fallbackTitleFromPrompt(prompt);
}

export async function generateSessionTitleForSession(sessionId: number, firstUserText: string) {
  const session = await repo.findSession(sessionId);
  if (!session) throw new Error("会话不存在");
  if (session.name !== "新对话") {
    return session.name;
  }

  const config: ModelConfig = loadModelConfig();
  const title = await generateTitle(createTitleModel(config), firstUserText);
  await repo.updateSession(sessionId, { name: title });
  return title;
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
