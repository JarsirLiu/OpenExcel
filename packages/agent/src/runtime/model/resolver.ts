import type { LanguageModel } from "ai";
import { createChatModel, createModelFromReference } from "./factory.js";
import type { ModelConfig, ModelPurpose } from "./types.js";

export function resolveModelForPurpose(config: ModelConfig, purpose: ModelPurpose): LanguageModel {
  if (purpose === "title" && config.titleModelName && config.titleModelName !== config.modelName) {
    return createModelFromReference({
      modelName: config.titleModelName,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey,
    });
  }

  return createChatModel(config);
}
