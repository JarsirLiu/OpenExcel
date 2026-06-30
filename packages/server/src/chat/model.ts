import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import type { ToolSet } from "./tools.js";

export function streamChat(input: {
  systemPrompt: string;
  messages: { role: "user" | "assistant"; content: string }[];
  tools: ToolSet;
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