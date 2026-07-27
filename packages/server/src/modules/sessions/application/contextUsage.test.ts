import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  loadModelConfig: vi.fn(),
  findLatestSessionContextUsage: vi.fn(),
}));

vi.mock("../../../config.js", () => ({ loadModelConfig: mocks.loadModelConfig }));
vi.mock("../runs/contextUsageRepository.js", () => ({
  findLatestSessionContextUsage: mocks.findLatestSessionContextUsage,
}));

import { getContextUsage } from "./contextUsage.js";

describe("getContextUsage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.loadModelConfig.mockReturnValue({ contextWindowTokens: 1_000_000 });
  });

  it("returns the latest usage as a display-ready snapshot", async () => {
    mocks.findLatestSessionContextUsage.mockResolvedValue({
      runId: 7,
      occurredAt: new Date("2026-07-27T00:00:00.000Z"),
      inputTokens: 159_900,
      estimatedContextTokens: 160_100,
      source: "provider",
    });

    await expect(getContextUsage(3, 9)).resolves.toEqual({
      contextWindowTokens: 1_000_000,
      usedTokens: 159_900,
      estimatedContextTokens: 160_100,
      percentage: 15.99,
      source: "provider",
      runId: 7,
      updatedAt: "2026-07-27T00:00:00.000Z",
    });
  });

  it("returns an empty snapshot before the first model step", async () => {
    mocks.findLatestSessionContextUsage.mockResolvedValue(null);

    await expect(getContextUsage(3, 9)).resolves.toEqual({
      contextWindowTokens: 1_000_000,
      usedTokens: 0,
      estimatedContextTokens: null,
      percentage: 0,
      source: "none",
      runId: null,
      updatedAt: null,
    });
  });
});
