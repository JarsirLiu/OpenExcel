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
    });
  });

  it("throws when a required variable is missing", async () => {
    vi.stubEnv("MODEL_BASE_URL", "https://test.api.com/v1");
    vi.stubEnv("MODEL_NAME", "gpt-4o-mini");

    const { loadModelConfig } = await import("../config.js");
    expect(() => loadModelConfig()).toThrow("MODEL_API_KEY");
  });
});
