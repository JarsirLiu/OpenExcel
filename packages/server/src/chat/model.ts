import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

export function streamChat(
  systemPrompt: string,
  messages: { role: "user" | "assistant"; content: string }[],
  onFinish?: (text: string) => void,
) {
  const config = loadModelConfig();
  const customOpenAI = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  return streamText({
    model: customOpenAI.chat(config.modelName),
    system: systemPrompt,
    messages,
    onFinish: onFinish ? async ({ text }) => onFinish(text) : undefined,
  });
}