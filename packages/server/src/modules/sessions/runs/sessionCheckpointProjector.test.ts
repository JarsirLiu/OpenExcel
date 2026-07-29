import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findAgentEventsForProjection: vi.fn(),
  findLatestSessionCheckpoint: vi.fn(),
  findRunProjectionState: vi.fn(),
  findRunCheckpoint: vi.fn(),
  persistRunCheckpoint: vi.fn(),
}));

vi.mock("./agentEventRepository.js", () => ({
  findAgentEventsForProjection: mocks.findAgentEventsForProjection,
}));
vi.mock("./checkpointRepository.js", () => ({
  findLatestSessionCheckpoint: mocks.findLatestSessionCheckpoint,
  findRunProjectionState: mocks.findRunProjectionState,
  findRunCheckpoint: mocks.findRunCheckpoint,
  persistRunCheckpoint: mocks.persistRunCheckpoint,
}));

import { projectRunCheckpointForRun } from "./sessionCheckpointProjector.js";

describe("projectRunCheckpointForRun", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.findRunProjectionState.mockResolvedValue({ id: 4, lastEventSequence: 3 });
    mocks.findRunCheckpoint.mockResolvedValue(null);
    mocks.findLatestSessionCheckpoint.mockResolvedValue({
      runId: 2,
      checkpointSequence: 8,
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "之前" }] } },
      ],
      reasoning: "",
      toolState: [],
    });
    mocks.findAgentEventsForProjection.mockResolvedValue([
      {
        eventId: "start-4",
        sequence: 1,
        type: "run.started",
        occurredAt: "2026-01-01T00:00:00.000Z",
        payload: {
          userMessage: { id: "user-4", role: "user", parts: [{ type: "text", text: "当前" }] },
        },
      },
      {
        eventId: "reasoning-4",
        sequence: 2,
        type: "reasoning.delta",
        occurredAt: "2026-01-01T00:00:01.000Z",
        payload: {
          messageId: "assistant-4",
          partId: "reasoning-4",
          delta: "先分析",
        },
      },
      {
        eventId: "text-4",
        sequence: 3,
        type: "message.delta",
        occurredAt: "2026-01-01T00:00:02.000Z",
        payload: { messageId: "assistant-4", partId: "text-4", delta: "结果" },
      },
    ]);
    mocks.persistRunCheckpoint.mockResolvedValue(true);
  });

  it("projects persisted events before returning the run checkpoint", async () => {
    await projectRunCheckpointForRun(1, 2, 4);

    expect(mocks.persistRunCheckpoint).toHaveBeenCalledWith({
      runId: 4,
      checkpointSequence: 3,
      reasoning: "先分析",
      toolState: [],
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "之前" }] } },
        {
          cursor: 1,
          message: { id: "user-4", role: "user", parts: [{ type: "text", text: "当前" }] },
        },
        {
          cursor: 2,
          message: {
            id: "assistant-4",
            role: "assistant",
            parts: [
              { id: "reasoning-4", type: "reasoning", text: "先分析" },
              { id: "text-4", type: "text", text: "结果" },
            ],
          },
        },
      ],
    });
  });

  it("does not rewrite a checkpoint when all events are already projected", async () => {
    mocks.findRunCheckpoint.mockResolvedValue({
      runId: 4,
      checkpointSequence: 3,
      transcript: [],
      reasoning: "",
      toolState: [],
    });

    await projectRunCheckpointForRun(1, 2, 4);

    expect(mocks.findAgentEventsForProjection).not.toHaveBeenCalled();
    expect(mocks.persistRunCheckpoint).not.toHaveBeenCalled();
  });

  it("repairs a pending tool in a recovery checkpoint without a new event", async () => {
    const checkpoint = {
      runId: 4,
      checkpointSequence: 3,
      transcript: [
        {
          cursor: 0,
          message: {
            id: "assistant-4",
            role: "assistant",
            parts: [
              {
                id: "tool-call-1",
                type: "tool-writeCells",
                toolCallId: "call-1",
                state: "input-available",
                input: { sheetId: 7 },
              },
            ],
          },
        },
      ],
      reasoning: "",
      toolState: [{ type: "tool.started", payload: { toolCallId: "call-1" } }],
    };
    mocks.findRunProjectionState.mockResolvedValue({
      id: 4,
      lastEventSequence: 3,
      status: "recovery_required",
    });
    mocks.findRunCheckpoint.mockResolvedValueOnce(checkpoint).mockResolvedValue(checkpoint);

    await projectRunCheckpointForRun(1, 2, 4);

    expect(mocks.persistRunCheckpoint).toHaveBeenCalledWith({
      runId: 4,
      checkpointSequence: 3,
      reasoning: "",
      toolState: checkpoint.toolState,
      transcript: [
        {
          cursor: 0,
          message: {
            id: "assistant-4",
            role: "assistant",
            parts: [
              {
                id: "tool-call-1",
                type: "tool-writeCells",
                toolCallId: "call-1",
                state: "output-error",
                input: { sheetId: 7 },
                errorText: "运行已终止，工具结果未完成",
              },
            ],
          },
        },
      ],
    });
  });
});
