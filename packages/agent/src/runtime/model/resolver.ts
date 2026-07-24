import type { LanguageModel } from "ai";
import { createChatModel, createModelFromReference } from "./factory.js";
import type { ModelConfig, ModelPurpose } from "./types.js";

export function resolveModelForPurpose(config: ModelConfig, purpose: ModelPurpose): LanguageModel {
  switch (purpose) {
    case "compaction":
      if (config.compactionModelName && config.compactionModelName !== config.modelName) {
        return createModelFromReference({
          modelName: config.compactionModelName,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
      }
      return createChatModel(config);

    case "title":
      if (config.titleModelName && config.titleModelName !== config.modelName) {
        return createModelFromReference({
          modelName: config.titleModelName,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
      }
      return createChatModel(config);

    case "summarization":
      if (config.compactionModelName) {
        return createModelFromReference({
          modelName: config.compactionModelName,
          baseUrl: config.baseUrl,
          apiKey: config.apiKey,
        });
      }
      return createChatModel(config);

    case "chat":
    default:
      return createChatModel(config);
  }
}
