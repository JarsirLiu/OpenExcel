import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findLatestSessionCheckpoint: vi.fn(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSession: mocks.findSession,
}));
vi.mock("../runs/checkpointRepository.js", () => ({
  findLatestSessionCheckpoint: mocks.findLatestSessionCheckpoint,
}));

import { getMessages } from "./querySessions.js";

describe("getMessages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSession.mockResolvedValue({ id: 7 });
    mocks.findLatestSessionCheckpoint.mockResolvedValue(null);
  });

  it("returns only the latest durable checkpoint", async () => {
    mocks.findLatestSessionCheckpoint.mockResolvedValue({
      runId: 12,
      checkpointSequence: 8,
      transcript: [
        { role: "user", parts: [{ type: "text", text: "读取数据" }] },
        { role: "assistant", parts: [{ type: "text", text: "部分结果" }] },
      ],
      reasoning: "先读取数据",
      toolState: [],
    });

    await expect(getMessages(3, 7)).resolves.toEqual({
      messages: [
        { role: "user", parts: [{ type: "text", text: "读取数据" }] },
        { role: "assistant", parts: [{ type: "text", text: "部分结果" }] },
      ],
      total: 2,
    });
  });

  it("returns an empty transcript when no checkpoint exists", async () => {
    await expect(getMessages(3, 7)).resolves.toEqual({ messages: [], total: 0 });
  });
});
