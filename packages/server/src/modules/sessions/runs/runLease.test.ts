import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  sessionFindFirst: vi.fn(),
  sessionUpdateMany: vi.fn(),
  sessionUpdate: vi.fn(),
  agentRunFindFirst: vi.fn(),
  agentRunUpdateMany: vi.fn(),
  agentRunCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    session: {
      findFirst: mocks.sessionFindFirst,
      updateMany: mocks.sessionUpdateMany,
      update: mocks.sessionUpdate,
    },
    agentRun: {
      findFirst: mocks.agentRunFindFirst,
      updateMany: mocks.agentRunUpdateMany,
      create: mocks.agentRunCreate,
    },
    $transaction: mocks.transaction,
  },
}));

import { SessionBusyError } from "../domain/sessionErrors.js";
import { acquireRunLease } from "./runLease.js";

describe("acquireRunLease", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) =>
      callback({
        session: {
          findFirst: mocks.sessionFindFirst,
          updateMany: mocks.sessionUpdateMany,
          update: mocks.sessionUpdate,
        },
        agentRun: {
          updateMany: mocks.agentRunUpdateMany,
          create: mocks.agentRunCreate,
        },
      }),
    );
    mocks.agentRunUpdateMany.mockResolvedValue({ count: 0 });
    mocks.sessionUpdateMany.mockResolvedValue({ count: 1 });
    mocks.sessionUpdate.mockResolvedValue({ id: 7 });
    mocks.agentRunCreate.mockResolvedValue({ id: 42, status: "running" });
  });

  it("commits the user turn and run under one lease transaction", async () => {
    const now = new Date("2026-07-23T00:00:00.000Z");
    mocks.sessionFindFirst.mockResolvedValue({
      id: 7,
      leaseOwnerId: null,
      leaseExpiresAt: null,
      version: 3,
      chatMessages: JSON.stringify([{ role: "user", parts: [{ type: "text", text: "old" }] }]),
    });

    const lease = await acquireRunLease({
      workspaceId: 1,
      sessionId: 7,
      requestId: "req-1",
      inputText: "new",
      now,
      appendUserTurn: (messages) => [...messages, { role: "user", text: "new" }],
    });

    expect(lease.sessionVersion).toBe(4);
    expect(lease.transcript).toHaveLength(2);
    expect(mocks.sessionUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ version: 3 }),
        data: expect.objectContaining({ version: 4 }),
      }),
    );
    expect(mocks.sessionUpdate).toHaveBeenCalledWith({
      where: { id: 7 },
      data: { chatMessages: expect.any(String) },
    });
    expect(mocks.agentRunCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        sessionId: 7,
        ownerId: expect.any(String),
        sessionVersion: 4,
        heartbeatAt: now,
      }),
    });
  });

  it("rejects a live lease before changing transcript or run state", async () => {
    mocks.sessionFindFirst.mockResolvedValue({
      id: 7,
      leaseOwnerId: "other-owner",
      leaseExpiresAt: new Date("2026-07-23T00:01:00.000Z"),
      version: 3,
      chatMessages: "[]",
    });

    await expect(
      acquireRunLease({
        workspaceId: 1,
        sessionId: 7,
        requestId: "req-2",
        inputText: "new",
        now: new Date("2026-07-23T00:00:00.000Z"),
        appendUserTurn: (messages) => messages,
      }),
    ).rejects.toBeInstanceOf(SessionBusyError);

    expect(mocks.sessionUpdateMany).not.toHaveBeenCalled();
    expect(mocks.agentRunCreate).not.toHaveBeenCalled();
  });

  it("only releases the lease owned by this run version", async () => {
    mocks.sessionFindFirst.mockResolvedValue({
      id: 7,
      leaseOwnerId: null,
      leaseExpiresAt: null,
      version: 3,
      chatMessages: "[]",
    });

    const lease = await acquireRunLease({
      workspaceId: 1,
      sessionId: 7,
      requestId: "req-3",
      inputText: "new",
      appendUserTurn: (messages) => messages,
    });

    await lease.release();

    expect(mocks.sessionUpdateMany).toHaveBeenLastCalledWith({
      where: {
        id: 7,
        leaseOwnerId: lease.ownerId,
        version: lease.sessionVersion,
      },
      data: {
        leaseOwnerId: null,
        leaseExpiresAt: null,
        leaseHeartbeatAt: null,
      },
    });
  });
});
