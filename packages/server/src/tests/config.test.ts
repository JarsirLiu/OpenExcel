import { afterEach, describe, expect, it, vi } from "vitest";

describe("environment model config", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("loads model config from environment variables", async () => {
    vi.stubEnv("MODEL_BASE_URL", "https://test.api.com/v1");
    vi.stubEnv("MODEL_API_KEY", "sk-test123");
    vi.stubEnv("MODEL_NAME", "gpt-4o-mini");

    const { loadModelConfig } = await import("../config.js");
    expect(loadModelConfig()).toEqual({
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
      readSheetBudgetTokens: 24_000,
    });
  });

  it("loads retry and timeout settings from environment variables", async () => {
    vi.stubEnv("MODEL_BASE_URL", "https://test.api.com/v1");
    vi.stubEnv("MODEL_API_KEY", "sk-test123");
    vi.stubEnv("MODEL_NAME", "gpt-4o-mini");
    vi.stubEnv("MODEL_MAX_RETRIES", "4");
    vi.stubEnv("MODEL_TIMEOUT_MS", "90000");
    vi.stubEnv("MODEL_CHUNK_TIMEOUT_MS", "15000");
    vi.stubEnv("MODEL_CONTEXT_WINDOW_TOKENS", "120000");
    vi.stubEnv("MODEL_OUTPUT_RESERVE_TOKENS", "12000");

    const { loadModelConfig } = await import("../config.js");
    expect(loadModelConfig()).toMatchObject({
      maxRetries: 4,
      timeoutMs: 90_000,
      chunkTimeoutMs: 15_000,
      contextWindowTokens: 120_000,
      outputReserveTokens: 12_000,
      maxConversationTurns: 20,
      maxUserInputTokens: 16_000,
      toolResultBudgetTokens: 32_000,
      toolResultMaxTokens: 8_000,
      readSheetBudgetTokens: 24_000,
    });
  });

  it("throws when a required variable is missing", async () => {
    vi.stubEnv("MODEL_BASE_URL", "https://test.api.com/v1");
    vi.stubEnv("MODEL_API_KEY", "");
    vi.stubEnv("MODEL_NAME", "gpt-4o-mini");

    const { loadModelConfig } = await import("../config.js");
    expect(() => loadModelConfig()).toThrow("MODEL_API_KEY");
  });
});
