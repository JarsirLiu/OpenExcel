import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import type { ModelConfig, RuntimeModelReference } from "./types.js";

function createOpenAICompatibleProvider(config: RuntimeModelReference) {
  return createOpenAICompatible({
    name: "openexcel",
    baseURL: config.baseUrl ?? "https://api.openai.com/v1",
    apiKey: config.apiKey ?? "",
    includeUsage: true,
  });
}

export function createChatModel(config: ModelConfig): LanguageModel {
  const provider = createOpenAICompatibleProvider({
    modelName: config.modelName,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
  });
  return provider.chatModel(config.modelName);
}

export function createModelFromReference(ref: RuntimeModelReference): LanguageModel {
  const provider = createOpenAICompatibleProvider(ref);
  return provider.chatModel(ref.modelName);
}
