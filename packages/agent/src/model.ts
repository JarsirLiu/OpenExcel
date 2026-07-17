import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";

export interface ModelConfig {
  baseUrl: string;
  apiKey: string;
  modelName: string;
}

function createOpenAICompatibleProvider(config: ModelConfig) {
  return createOpenAICompatible({
    name: "openexcel",
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
    includeUsage: true,
  });
}

export function createChatModel(config: ModelConfig): LanguageModel {
  const provider = createOpenAICompatibleProvider(config);
  return provider.chatModel(config.modelName);
}

export function createTitleModel(config: ModelConfig): LanguageModel {
  const provider = createOpenAICompatibleProvider(config);
  return provider.chatModel(config.modelName);
}
