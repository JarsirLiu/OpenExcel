import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

const openai = createOpenAI({
  baseURL: loadModelConfig().baseUrl,
  apiKey: loadModelConfig().apiKey,
});

export function streamChat(input: {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: Record<string, any>;
  abortSignal?: AbortSignal;
  onChunk?: (chunk: any) => Promise<void> | void;
  onFinish?: (result: any) => Promise<void> | void;
  onAbort?: (event: any) => Promise<void> | void;
}): any {
  const config = loadModelConfig();
  const customOpenAI = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  return streamText({
    model: customOpenAI.chat(config.modelName),
    system: input.systemPrompt,
    messages: input.messages,
    tools: input.tools,
    reasoning: "high",
    abortSignal: input.abortSignal,
    onChunk: input.onChunk,
    onFinish: input.onFinish,
    onAbort: input.onAbort,
  }) as any;
}

export async function generateTitle(prompt: string): Promise<string> {
  const config = loadModelConfig();
  const result = await streamText({
    model: openai.chat(config.modelName),
    system: "请用10个字以内概括用户消息的主题。只输出标题，不要多余内容。",
    messages: [{ role: "user", content: prompt }],
  });

  const text = await result.text;
  return (text || "").trim().slice(0, 10) || "新对话";
}