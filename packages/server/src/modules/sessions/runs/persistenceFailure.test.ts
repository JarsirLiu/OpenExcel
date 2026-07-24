import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistAgentEvent: vi.fn(),
}));

vi.mock("./agentEventRepository.js", () => ({
  persistAgentEvent: mocks.persistAgentEvent,
}));

import { createAgentPersistenceBarrier } from "./agentPersistence.js";

describe("createAgentPersistenceBarrier", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("propagates event persistence failures to the agent loop", async () => {
    mocks.persistAgentEvent.mockRejectedValueOnce(new Error("Database unavailable"));

    const barrier = createAgentPersistenceBarrier(9);
    const event = {
      eventId: "event-1",
      sequence: 1,
      type: "run.started" as const,
      occurredAt: "2026-07-23T00:00:00.000Z",
      payload: { droppedMessages: 0, droppedTurns: 0 },
    };

    await expect(barrier.persist(event)).rejects.toThrow("Database unavailable");
    expect(mocks.persistAgentEvent).toHaveBeenCalledWith(9, event, undefined);
  });

  it("does not discard events persisted before a later failure", async () => {
    const persistedEvents: unknown[] = [];
    mocks.persistAgentEvent
      .mockImplementationOnce(async (_runId, event) => {
        persistedEvents.push(event);
      })
      .mockRejectedValueOnce(new Error("Second event failed"));

    const barrier = createAgentPersistenceBarrier(9);
    const firstEvent = {
      eventId: "event-1",
      sequence: 1,
      type: "run.started" as const,
      occurredAt: "2026-07-23T00:00:00.000Z",
      payload: { droppedMessages: 0, droppedTurns: 0 },
    };
    const secondEvent = {
      eventId: "event-2",
      sequence: 2,
      type: "tool.started" as const,
      occurredAt: "2026-07-23T00:00:01.000Z",
      payload: { toolName: "writeCells", toolCallId: "call-1", input: {} },
    };

    await barrier.persist(firstEvent);
    await expect(barrier.persist(secondEvent)).rejects.toThrow("Second event failed");

    expect(persistedEvents).toEqual([firstEvent]);
  });
});
