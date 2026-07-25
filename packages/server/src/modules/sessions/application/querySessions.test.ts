import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findLatestRecoverableRun: vi.fn(),
  findLatestSessionCheckpoint: vi.fn(),
  findRunsBySession: vi.fn(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSession: mocks.findSession,
}));
vi.mock("../runs/repository.js", () => ({
  findLatestRecoverableRun: mocks.findLatestRecoverableRun,
  findRunsBySession: mocks.findRunsBySession,
}));
vi.mock("../runs/checkpointRepository.js", () => ({
  findLatestSessionCheckpoint: mocks.findLatestSessionCheckpoint,
}));

import { getMessages } from "./querySessions.js";

describe("getMessages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSession.mockResolvedValue({ id: 7 });
    mocks.findLatestRecoverableRun.mockResolvedValue(null);
    mocks.findLatestSessionCheckpoint.mockResolvedValue(null);
    mocks.findRunsBySession.mockResolvedValue([]);
  });

  it("returns the latest durable checkpoint and its recovery run", async () => {
    mocks.findLatestRecoverableRun.mockResolvedValue(12);
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
      recoverableRunId: 12,
    });
    expect(mocks.findRunsBySession).not.toHaveBeenCalled();
  });

  it("rebuilds fallback history in chronological order", async () => {
    mocks.findRunsBySession.mockResolvedValue([
      {
        id: 12,
        startedAt: new Date("2026-01-02T00:00:00.000Z"),
        status: "completed",
        inputText: "第二问",
        outputText: "第二答",
      },
      {
        id: 11,
        startedAt: new Date("2026-01-01T00:00:00.000Z"),
        status: "completed",
        inputText: "第一问",
        outputText: "第一答",
      },
    ]);

    await expect(getMessages(3, 7)).resolves.toEqual({
      messages: [
        { role: "user", content: "第一问" },
        { role: "assistant", content: "第一答" },
        { role: "user", content: "第二问" },
        { role: "assistant", content: "第二答" },
      ],
      total: 4,
      recoverableRunId: null,
    });
  });
});
