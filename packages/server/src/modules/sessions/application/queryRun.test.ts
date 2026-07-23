import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findRunReplaySnapshot: vi.fn(),
  findAgentEventPageForSession: vi.fn(),
}));

vi.mock("../runs/repository.js", () => ({
  findRunReplaySnapshot: mocks.findRunReplaySnapshot,
}));
vi.mock("../runs/agentEventRepository.js", () => ({
  findAgentEventPageForSession: mocks.findAgentEventPageForSession,
}));

import { getRunEventPage, getRunReplaySnapshot } from "./queryRun.js";

const snapshot = {
  id: 12,
  status: "completed",
  clientRequestId: "request-12",
  startedAt: new Date("2026-07-23T00:00:00.000Z"),
  endedAt: new Date("2026-07-23T00:00:05.000Z"),
  outputText: "已完成",
  errorMessage: null,
  cancelRequestedAt: null,
  lastEventSequence: 3,
};

describe("run replay queries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a terminal snapshot without exposing model context fields", async () => {
    mocks.findRunReplaySnapshot.mockResolvedValue(snapshot);

    await expect(getRunReplaySnapshot(4, 8, 12)).resolves.toEqual({
      runId: 12,
      status: "completed",
      requestId: "request-12",
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      outputText: "已完成",
      errorMessage: null,
      cancelRequested: false,
      terminal: true,
      lastEventSequence: 3,
    });
    expect(mocks.findRunReplaySnapshot).toHaveBeenCalledWith(4, 8, 12);
  });

  it("replays only events after the supplied cursor and returns the terminal cursor", async () => {
    mocks.findAgentEventPageForSession.mockResolvedValue({
      run: snapshot,
      events: [
        {
          eventId: "event-2",
          sequence: 2,
          type: "tool.finished",
          occurredAt: new Date("2026-07-23T00:00:02.000Z"),
          payload: JSON.stringify({ toolName: "readSheetData", output: { rows: [] } }),
        },
        {
          eventId: "event-3",
          sequence: 3,
          type: "run.completed",
          occurredAt: new Date("2026-07-23T00:00:03.000Z"),
          payload: JSON.stringify({ messageCount: 3 }),
        },
      ],
    });

    await expect(
      getRunEventPage({
        workspaceId: 4,
        sessionId: 8,
        runId: 12,
        afterSequence: 1,
        limit: 2,
      }),
    ).resolves.toEqual({
      run: expect.objectContaining({ runId: 12, status: "completed", terminal: true }),
      events: [
        expect.objectContaining({
          eventId: "event-2",
          sequence: 2,
          payload: { toolName: "readSheetData", output: { rows: [] } },
        }),
        expect.objectContaining({
          eventId: "event-3",
          sequence: 3,
          payload: { messageCount: 3 },
        }),
      ],
      cursor: { after: 3, lastEventSequence: 3 },
      hasMore: false,
    });
    expect(mocks.findAgentEventPageForSession).toHaveBeenCalledWith({
      workspaceId: 4,
      sessionId: 8,
      runId: 12,
      afterSequence: 1,
      limit: 2,
    });
  });

  it("rejects corrupted event payloads instead of returning an incomplete replay", async () => {
    mocks.findAgentEventPageForSession.mockResolvedValue({
      run: snapshot,
      events: [
        {
          eventId: "event-1",
          sequence: 1,
          type: "step.finished",
          occurredAt: new Date("2026-07-23T00:00:01.000Z"),
          payload: "not-json",
        },
      ],
    });

    await expect(
      getRunEventPage({
        workspaceId: 4,
        sessionId: 8,
        runId: 12,
        afterSequence: -1,
        limit: 200,
      }),
    ).rejects.toThrow("运行事件数据损坏，无法回放");
  });
});
