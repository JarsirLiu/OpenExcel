import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { isLoopFinished, streamText } from "ai";

const openai = createOpenAI({
  baseURL: loadModelConfig().baseUrl,
  apiKey: loadModelConfig().apiKey,
});

export function streamChat(input: {
  systemPrompt: string;
  messages: any[];
  tools: Record<string, any>;
  toolsContext?: Record<string, unknown>;
  abortSignal?: AbortSignal;
  onStepFinish?: (...args: any[]) => void | Promise<void>;
  onFinish?: (...args: any[]) => void | Promise<void>;
  onAbort?: (...args: any[]) => void | Promise<void>;
  onError?: (...args: any[]) => void | Promise<void>;
}): ReturnType<typeof streamText> {
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
    toolsContext: input.toolsContext as any,
    stopWhen: isLoopFinished(),
    abortSignal: input.abortSignal,
    onStepFinish: input.onStepFinish,
    onFinish: input.onFinish,
    onAbort: input.onAbort,
    onError: input.onError,
  });
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
