import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateRunWithLease: vi.fn(),
  completeRunAndUpdateUndoCheckpoint: vi.fn(),
  withSessionLock: vi.fn(),
  findAgentEventsByRun: vi.fn(),
  persistRunLifecycleEvent: vi.fn(),
  persistRunCheckpoint: vi.fn(),
  findRunCheckpoint: vi.fn(),
}));

vi.mock("../infrastructure/sessionLock.js", () => ({
  withSessionLock: mocks.withSessionLock,
}));
vi.mock("./repository.js", () => ({
  updateRunWithLease: mocks.updateRunWithLease,
}));
vi.mock("./undoCheckpoint.js", () => ({
  completeRunAndUpdateUndoCheckpoint: mocks.completeRunAndUpdateUndoCheckpoint,
}));
vi.mock("./agentEventRepository.js", () => ({
  findAgentEventsByRun: mocks.findAgentEventsByRun,
  persistRunLifecycleEvent: mocks.persistRunLifecycleEvent,
}));
vi.mock("./checkpointRepository.js", () => ({
  persistRunCheckpoint: mocks.persistRunCheckpoint,
  findRunCheckpoint: mocks.findRunCheckpoint,
}));

import { createRunFinalizer } from "./runFinalizer.js";

function createLease(release = vi.fn()) {
  return {
    run: { id: 9 },
    ownerId: "owner-1",
    sessionVersion: 3,
    transcript: [],
    release,
  } as any;
}

describe("createRunFinalizer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.withSessionLock.mockImplementation(async (_sessionId, callback) => callback());
    mocks.updateRunWithLease.mockResolvedValue(true);
    mocks.completeRunAndUpdateUndoCheckpoint.mockResolvedValue(undefined);
    mocks.findAgentEventsByRun.mockResolvedValue([]);
    mocks.persistRunLifecycleEvent.mockResolvedValue(undefined);
    mocks.persistRunCheckpoint.mockResolvedValue(true);
    mocks.findRunCheckpoint.mockResolvedValue(null);
  });

  it("persists the canonical transcript before the terminal run state", async () => {
    const order: string[] = [];
    mocks.completeRunAndUpdateUndoCheckpoint.mockImplementation(async () => {
      order.push("run");
    });
    const release = vi.fn(async () => order.push("lease"));
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({
      status: "completed",
      outputText: "done",
    });

    expect(order).toEqual(["run", "lease"]);
    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      9,
      expect.objectContaining({ status: "completed", outputText: "done" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
  });

  it("persists the checkpoint before the terminal run state", async () => {
    const order: string[] = [];
    mocks.findAgentEventsByRun.mockResolvedValue([
      {
        eventId: "message-1",
        sequence: 4,
        type: "message.delta",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: JSON.stringify({ messageId: "message-1", delta: "done" }),
      },
    ]);
    mocks.persistRunCheckpoint.mockImplementation(async () => {
      order.push("checkpoint");
      return true;
    });
    mocks.completeRunAndUpdateUndoCheckpoint.mockImplementation(async () => {
      order.push("run");
    });

    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(),
    });
    await finalizer.finalize({
      status: "completed",
    });

    expect(order).toEqual(["checkpoint", "run"]);
    expect(mocks.persistRunCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({ runId: 9, checkpointSequence: 4, reasoning: "", toolState: [] }),
    );
  });

  it("projects the terminal event before run state settles and publishes last", async () => {
    const order: string[] = [];
    const lifecycleEvent = {
      eventId: "run-completed",
      sequence: 1,
      type: "run.completed",
      occurredAt: new Date("2026-01-01T00:00:00.000Z"),
      payload: JSON.stringify({}),
    };
    mocks.persistRunLifecycleEvent.mockImplementation(async () => {
      order.push("event");
      return lifecycleEvent;
    });
    mocks.findAgentEventsByRun.mockResolvedValueOnce([
      {
        eventId: "message-1",
        sequence: 0,
        type: "message.delta",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: JSON.stringify({ messageId: "assistant-1", delta: "done" }),
      },
    ]);
    mocks.persistRunCheckpoint.mockImplementation(async () => {
      order.push("checkpoint");
      return true;
    });
    mocks.completeRunAndUpdateUndoCheckpoint.mockImplementation(async () => {
      order.push("run");
    });
    const eventSink = {
      publish: vi.fn(async () => {
        order.push("publish");
      }),
    };

    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(),
      eventSink,
    });

    await finalizer.finalize({ status: "completed" });

    expect(order).toEqual(["event", "checkpoint", "run", "publish"]);
  });

  it("persists text and reasoning from independent streamed events when cancelled", async () => {
    mocks.findAgentEventsByRun.mockResolvedValue([
      {
        eventId: "reasoning-1",
        sequence: 1,
        type: "reasoning.delta",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: JSON.stringify({
          messageId: "assistant-1",
          partId: "reasoning-1",
          delta: "先分析",
        }),
      },
      {
        eventId: "message-1",
        sequence: 2,
        type: "message.delta",
        occurredAt: new Date("2026-01-01T00:00:01.000Z"),
        payload: JSON.stringify({
          messageId: "assistant-1",
          partId: "text-1",
          delta: "结果",
        }),
      },
    ]);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(),
    });
    await finalizer.finalize({ status: "cancelled" });

    expect(mocks.persistRunCheckpoint).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: [
          {
            cursor: 0,
            message: {
              id: "assistant-1",
              role: "assistant",
              parts: [
                { id: "reasoning-1", type: "reasoning", text: "先分析" },
                { id: "text-1", type: "text", text: "结果" },
              ],
            },
          },
        ],
      }),
    );
  });

  it("uses recovery_required when transcript persistence fails and always releases the lease", async () => {
    mocks.findAgentEventsByRun.mockResolvedValue([
      {
        eventId: "message-1",
        sequence: 1,
        type: "message.delta",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: JSON.stringify({ messageId: "assistant-1", delta: "done" }),
      },
    ]);
    mocks.persistRunCheckpoint.mockRejectedValue(new Error("database unavailable"));
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({ status: "completed" });

    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      9,
      expect.objectContaining({ status: "recovery_required" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it("does not persist or publish a terminal event when checkpoint persistence fails", async () => {
    mocks.findAgentEventsByRun.mockResolvedValue([
      {
        eventId: "message-1",
        sequence: 1,
        type: "message.delta",
        occurredAt: new Date("2026-01-01T00:00:00.000Z"),
        payload: JSON.stringify({ messageId: "assistant-1", delta: "done" }),
      },
    ]);
    mocks.persistRunCheckpoint.mockRejectedValue(new Error("database unavailable"));
    const eventSink = { publish: vi.fn() };
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(),
      eventSink,
    });

    await finalizer.finalize({ status: "completed" });

    expect(mocks.persistRunLifecycleEvent).toHaveBeenCalled();
    expect(eventSink.publish).not.toHaveBeenCalled();
    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledWith(
      1,
      2,
      9,
      expect.objectContaining({ status: "recovery_required" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
  });

  it("shares one finalization promise across duplicate triggers", async () => {
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });
    const first = finalizer.finalize({ status: "completed" });
    const second = finalizer.finalize({ status: "failed" });

    await Promise.all([first, second]);

    expect(mocks.completeRunAndUpdateUndoCheckpoint).toHaveBeenCalledOnce();
    expect(release).toHaveBeenCalledOnce();
  });

  it("marks a still-running run for recovery when terminal persistence fails", async () => {
    mocks.completeRunAndUpdateUndoCheckpoint.mockRejectedValue(new Error("database unavailable"));
    const release = vi.fn().mockResolvedValue(undefined);
    const finalizer = createRunFinalizer({
      workspaceId: 1,
      sessionId: 2,
      lease: createLease(release),
    });

    await finalizer.finalize({ status: "completed" });

    expect(mocks.updateRunWithLease).toHaveBeenCalledWith(
      9,
      expect.objectContaining({ status: "recovery_required" }),
      { ownerId: "owner-1", sessionVersion: 3 },
    );
    expect(release).toHaveBeenCalledOnce();
  });
});
