import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { isLoopFinished, streamText } from "ai";

function createOpenAIProvider(config: ReturnType<typeof loadModelConfig>) {
  return createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
}

export function createChatModel() {
  const config = loadModelConfig();
  const openai = createOpenAIProvider(config);
  return openai.chat(config.modelName);
}

export function createTitleModel() {
  const config = loadModelConfig();
  const openai = createOpenAIProvider(config);
  return openai.completion(config.modelName);
}

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
  return streamText({
    model: createChatModel(),
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
