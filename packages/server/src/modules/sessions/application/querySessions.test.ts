import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSession: vi.fn(),
  findLatestSessionRun: vi.fn(),
  findLatestSessionCheckpoint: vi.fn(),
  projectRunCheckpointForRun: vi.fn(),
}));

vi.mock("../infrastructure/sessionRepository.js", () => ({
  findSession: mocks.findSession,
}));
vi.mock("../runs/checkpointRepository.js", () => ({
  findLatestSessionRun: mocks.findLatestSessionRun,
  findLatestSessionCheckpoint: mocks.findLatestSessionCheckpoint,
}));
vi.mock("../runs/sessionCheckpointProjector.js", () => ({
  projectRunCheckpointForRun: mocks.projectRunCheckpointForRun,
}));

import { getMessages } from "./querySessions.js";

describe("getMessages", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findSession.mockResolvedValue({ id: 7 });
    mocks.findLatestSessionRun.mockResolvedValue(null);
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

  it("projects the latest run before reading history", async () => {
    mocks.findLatestSessionRun.mockResolvedValue({ id: 13, lastEventSequence: 2 });
    mocks.findLatestSessionCheckpoint.mockResolvedValue({
      runId: 13,
      checkpointSequence: 2,
      transcript: [{ role: "assistant", parts: [{ type: "text", text: "已恢复" }] }],
      reasoning: "",
      toolState: [],
    });

    await getMessages(3, 7);

    expect(mocks.projectRunCheckpointForRun).toHaveBeenCalledWith(3, 7, 13);
  });

  it("returns an empty transcript when no checkpoint exists", async () => {
    await expect(getMessages(3, 7)).resolves.toEqual({ messages: [], total: 0 });
  });
});
