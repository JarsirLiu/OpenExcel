import { describe, expect, it } from "vitest";
import { createModelConfig } from "../config.js";

describe("environment model config", () => {
  it("loads model config from environment variables", () => {
    expect(
      createModelConfig({
        MODEL_BASE_URL: "https://test.api.com/v1",
        MODEL_API_KEY: "sk-test123",
        MODEL_NAME: "gpt-4o-mini",
      }),
    ).toEqual({
      baseUrl: "https://test.api.com/v1",
      apiKey: "sk-test123",
      modelName: "gpt-4o-mini",
      maxRetries: 2,
      timeoutMs: 120_000,
      chunkTimeoutMs: 30_000,
      contextWindowTokens: 180_000,
      outputReserveTokens: 16_000,
      maxConversationTurns: 20,
      maxUserInputTokens: 16_000,
      toolResultBudgetTokens: 32_000,
      toolResultMaxTokens: 8_000,
      readSheetDataBudgetTokens: 24_000,
    });
  });

  it("loads retry and timeout settings from environment variables", () => {
    expect(
      createModelConfig({
        MODEL_BASE_URL: "https://test.api.com/v1",
        MODEL_API_KEY: "sk-test123",
        MODEL_NAME: "gpt-4o-mini",
        MODEL_MAX_RETRIES: "3",
        MODEL_TIMEOUT_MS: "90000",
        MODEL_CHUNK_TIMEOUT_MS: "15000",
        MODEL_CONTEXT_WINDOW_TOKENS: "120000",
        MODEL_OUTPUT_RESERVE_TOKENS: "12000",
      }),
    ).toMatchObject({
      maxRetries: 3,
      timeoutMs: 90_000,
      chunkTimeoutMs: 15_000,
      contextWindowTokens: 120_000,
      outputReserveTokens: 12_000,
      maxConversationTurns: 20,
      maxUserInputTokens: 16_000,
      toolResultBudgetTokens: 32_000,
      toolResultMaxTokens: 8_000,
      readSheetDataBudgetTokens: 24_000,
    });
  });

  it("caps model retries to keep transient failures bounded", () => {
    expect(
      createModelConfig({
        MODEL_BASE_URL: "https://test.api.com/v1",
        MODEL_API_KEY: "sk-test123",
        MODEL_NAME: "gpt-4o-mini",
        MODEL_MAX_RETRIES: "99",
      }).maxRetries,
    ).toBe(3);
  });

  it("throws when a required variable is missing", () => {
    expect(() =>
      createModelConfig({
        MODEL_BASE_URL: "https://test.api.com/v1",
        MODEL_API_KEY: "",
        MODEL_NAME: "gpt-4o-mini",
      }),
    ).toThrow("MODEL_API_KEY");
  });
});
