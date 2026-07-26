import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  eventFindUnique: vi.fn(),
  eventCreate: vi.fn(),
  stepCreate: vi.fn(),
  runUpdateMany: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    $transaction: mocks.transaction,
    agentEvent: { findUnique: mocks.eventFindUnique },
  },
}));

import { AgentEventConflictError, persistAgentEvent } from "./agentEventRepository.js";

const event = {
  eventId: "event-1",
  sequence: 4,
  type: "message.delta" as const,
  occurredAt: "2026-07-26T08:00:00.000Z",
  payload: { delta: "完成" },
};

const existing = {
  id: 1,
  runId: 9,
  eventId: event.eventId,
  sequence: event.sequence,
  type: event.type,
  occurredAt: new Date(event.occurredAt),
  payload: JSON.stringify(event.payload),
};

function transactionClient() {
  return {
    agentEvent: { findUnique: mocks.eventFindUnique, create: mocks.eventCreate },
    agentStep: { create: mocks.stepCreate },
    agentRun: { updateMany: mocks.runUpdateMany },
  };
}

describe("persistAgentEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation((callback: (tx: unknown) => unknown) =>
      callback(transactionClient()),
    );
    mocks.eventFindUnique.mockResolvedValue(null);
    mocks.eventCreate.mockResolvedValue(existing);
    mocks.stepCreate.mockResolvedValue(undefined);
    mocks.runUpdateMany.mockResolvedValue({ count: 1 });
  });

  it("returns the existing event when the same event is persisted twice", async () => {
    mocks.eventFindUnique.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        "eventId" in where ? existing : null,
    );

    await expect(persistAgentEvent(9, event)).resolves.toEqual(existing);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("rejects a different payload for an existing sequence", async () => {
    mocks.eventFindUnique.mockImplementation(
      async ({ where }: { where: Record<string, unknown> }) =>
        "runId_sequence" in where
          ? { ...existing, payload: JSON.stringify({ delta: "错误" }) }
          : null,
    );

    await expect(persistAgentEvent(9, event)).rejects.toBeInstanceOf(AgentEventConflictError);
    expect(mocks.eventCreate).not.toHaveBeenCalled();
  });

  it("re-reads the winner after a concurrent unique-key race", async () => {
    mocks.eventCreate.mockRejectedValueOnce({ code: "P2002" });
    mocks.eventFindUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing)
      .mockResolvedValueOnce(existing);

    await expect(persistAgentEvent(9, event)).resolves.toEqual(existing);
    expect(mocks.transaction).toHaveBeenCalledOnce();
  });
});
