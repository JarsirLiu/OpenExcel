import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  findUniqueOrThrow: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));

vi.mock("../../../infra/database/db.js", () => ({
  prisma: {
    agentToolExecution: {
      findUnique: mocks.findUnique,
      findUniqueOrThrow: mocks.findUniqueOrThrow,
      create: mocks.create,
      update: mocks.update,
    },
  },
}));

import { claimToolExecution } from "./toolExecutionRepository.js";

describe("claimToolExecution", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("does not retry an unresolved tool call after it becomes old", async () => {
    mocks.findUnique.mockResolvedValue({
      id: 4,
      runId: 9,
      toolCallId: "call-1",
      toolName: "createChart",
      input: JSON.stringify({ sheetId: 1 }),
      status: "running",
      startedAt: new Date("2025-01-01T00:00:00.000Z"),
    });

    await expect(
      claimToolExecution({
        runId: 9,
        toolCallId: "call-1",
        toolName: "createChart",
        input: { sheetId: 1 },
        now: new Date("2025-01-02T00:00:00.000Z"),
      }),
    ).rejects.toThrow("requires recovery");

    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("claims a newly inserted execution", async () => {
    const now = new Date("2025-01-02T00:00:00.000Z");
    mocks.findUnique.mockResolvedValue(null);
    mocks.create.mockResolvedValue({});

    await expect(
      claimToolExecution({
        runId: 9,
        toolCallId: "call-1",
        toolName: "createChart",
        input: { sheetId: 1 },
        now,
      }),
    ).resolves.toEqual({ kind: "execute" });
  });
});
