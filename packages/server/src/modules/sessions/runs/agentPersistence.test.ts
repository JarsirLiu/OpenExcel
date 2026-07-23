import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistAgentEvent: vi.fn(),
  claimToolExecution: vi.fn(),
  completeToolExecution: vi.fn(),
  failToolExecution: vi.fn(),
}));

vi.mock("./agentEventRepository.js", () => ({
  persistAgentEvent: mocks.persistAgentEvent,
}));
vi.mock("./toolExecutionRepository.js", () => ({
  claimToolExecution: mocks.claimToolExecution,
  completeToolExecution: mocks.completeToolExecution,
  failToolExecution: mocks.failToolExecution,
}));

import { createAgentPersistenceBarrier, createIdempotentToolExecutor } from "./agentPersistence.js";

describe("agent persistence adapters", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("persists a step event with the derived AgentStep in one repository call", async () => {
    const event = {
      eventId: "event-1",
      sequence: 4,
      type: "step.finished" as const,
      occurredAt: "2026-07-23T00:00:00.000Z",
      payload: {
        stepType: "tool-result",
        finishReason: "stop",
        text: "完成",
        toolCalls: [{ toolName: "readSheetData" }],
        toolResults: [{ isError: false }],
      },
    };

    await createAgentPersistenceBarrier(9).persist(event);

    expect(mocks.persistAgentEvent).toHaveBeenCalledWith(
      9,
      event,
      expect.objectContaining({
        type: "tool-result",
        status: "stop",
        content: "完成",
        toolName: "readSheetData",
        order: 4,
      }),
    );
  });

  it("replays a completed tool call without invoking the concrete executor", async () => {
    mocks.claimToolExecution.mockResolvedValue({ kind: "replay", output: { value: 7 } });
    const execute = vi.fn();
    const executor = createIdempotentToolExecutor(9, { execute });

    const output = await executor.execute(
      "readSheetData",
      { sheetId: 3 },
      {
        toolCallId: "call-1",
        context: {},
      },
    );

    expect(output).toEqual({ value: 7 });
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.completeToolExecution).not.toHaveBeenCalled();
  });

  it("records a newly executed tool result and failures", async () => {
    mocks.claimToolExecution.mockResolvedValue({ kind: "execute" });
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const executor = createIdempotentToolExecutor(9, { execute });

    await expect(
      executor.execute("writeCells", { sheetId: 3 }, { toolCallId: "call-1", context: {} }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.completeToolExecution).toHaveBeenCalledWith(9, "call-1", { ok: true });

    const failure = new Error("tool failed");
    execute.mockRejectedValueOnce(failure);
    await expect(
      executor.execute("writeCells", { sheetId: 3 }, { toolCallId: "call-2", context: {} }),
    ).rejects.toThrow("tool failed");
    expect(mocks.failToolExecution).toHaveBeenCalledWith(9, "call-2", failure);
  });
});
