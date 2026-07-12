import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

function createOpenAIProvider(config: ModelConfig) {
  return createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });
}

export function createChatModel(config: ModelConfig): LanguageModel {
  const openai = createOpenAIProvider(config);
  return openai.chat(config.modelName);
}

export function createTitleModel(config: ModelConfig): LanguageModel {
  const openai = createOpenAIProvider(config);
  return openai.chat(config.modelName);
}
