import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findFirst: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: { agentEvent: { findFirst: mocks.findFirst } },
}));

import { findLatestSessionContextUsage } from "./contextUsageRepository.js";

describe("findLatestSessionContextUsage", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reads the latest persisted step usage", async () => {
    const occurredAt = new Date("2026-07-27T00:00:00.000Z");
    mocks.findFirst.mockResolvedValue({
      runId: 7,
      occurredAt,
      payload: JSON.stringify({
        tokenObservation: { inputTokens: 159900, source: "provider" },
        estimatedContextTokens: 160100,
      }),
    });

    await expect(findLatestSessionContextUsage(3, 9)).resolves.toEqual({
      runId: 7,
      occurredAt,
      inputTokens: 159900,
      estimatedContextTokens: 160100,
      source: "provider",
    });
    expect(mocks.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ type: "step.finished" }),
      }),
    );
  });

  it("ignores malformed usage payloads", async () => {
    mocks.findFirst.mockResolvedValue({
      runId: 7,
      occurredAt: new Date(),
      payload: JSON.stringify({ tokenObservation: { inputTokens: "159900" } }),
    });

    await expect(findLatestSessionContextUsage(3, 9)).resolves.toBeNull();
  });
});
