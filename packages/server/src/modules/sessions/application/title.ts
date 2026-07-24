import { type ModelConfig, resolveModelForPurpose } from "@openexcel/agent";
import { generateText, type LanguageModel } from "ai";
import { loadModelConfig } from "../../../config.js";
import { withSessionLock } from "../infrastructure/sessionLock.js";
import * as repo from "../infrastructure/sessionRepository.js";

export async function generateTitle(model: LanguageModel, prompt: string): Promise<string> {
  try {
    const { text } = await generateText({
      model,
      prompt: `请为下面这条用户消息生成一个不超过10个汉字的会话标题，只输出标题，不要解释，不要加引号，不要输出思考过程。\n\n用户消息：${prompt}`,
      maxOutputTokens: 32,
      temperature: 0,
    });

    const cleaned = stripThinkingTags(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (cleaned) {
      return cleaned.slice(0, 10);
    }
  } catch (error) {
    console.error("[server] Failed to generate title from model, falling back:", error);
  }

  return fallbackTitleFromPrompt(prompt);
}

export async function generateSessionTitleForSession(
  workspaceId: number,
  sessionId: number,
  firstUserText: string,
  options: { initialTitle?: string } = {},
) {
  const session = await repo.findSession(sessionId, workspaceId);
  if (!session) throw new Error("会话不存在");
  const initialTitle = options.initialTitle ?? "新对话";
  if (session.titleStatus && session.titleStatus !== "pending") {
    return session.name;
  }
  if (session.name !== "新对话" && session.name !== initialTitle) {
    return session.name;
  }

  const config: ModelConfig = loadModelConfig();
  const title = await generateTitle(resolveModelForPurpose(config, "title"), firstUserText);
  return withSessionLock(sessionId, async () => {
    const latestSession = await repo.findSession(sessionId, workspaceId);
    if (!latestSession) throw new Error("会话不存在");
    if (latestSession.titleStatus && latestSession.titleStatus !== "pending") {
      return latestSession.name;
    }
    if (latestSession.name !== "新对话" && latestSession.name !== initialTitle) {
      return latestSession.name;
    }
    const updated = await repo.updateSessionNameIfUnchanged(
      sessionId,
      workspaceId,
      [...new Set(["新对话", initialTitle])],
      title,
    );
    if (updated) return title;

    const renamedSession = await repo.findSession(sessionId, workspaceId);
    return renamedSession?.name ?? title;
  });
}

export function scheduleSessionTitleGeneration(
  workspaceId: number,
  sessionId: number,
  firstUserText: string,
) {
  if (!firstUserText.trim()) return;

  void generateSessionTitleForSession(workspaceId, sessionId, firstUserText, {
    initialTitle: fallbackTitleFromPrompt(firstUserText),
  }).catch((error) => {
    console.error(`[session] Failed to update title for session ${sessionId}:`, error);
  });
}

function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<\/?think>/gi, "");
}

export function fallbackTitleFromPrompt(prompt: string): string {
  const fallback = prompt.replace(/\s+/g, " ").trim().slice(0, 10);
  return fallback || "新对话";
}
