import { AgentPersistenceError } from "@openexcel/agent";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  persistAgentEvent: vi.fn(),
  claimToolExecutionUsing: vi.fn(),
  completeToolExecutionUsing: vi.fn(),
  failToolExecutionUsing: vi.fn(),
}));

vi.mock("./agentEventRepository.js", () => ({
  persistAgentEvent: mocks.persistAgentEvent,
}));
vi.mock("./toolExecutionRepository.js", () => ({
  claimToolExecutionUsing: mocks.claimToolExecutionUsing,
  completeToolExecutionUsing: mocks.completeToolExecutionUsing,
  failToolExecutionUsing: mocks.failToolExecutionUsing,
}));
vi.mock("../../../infra/database/db.js", () => ({
  prisma: { $transaction: (callback: (tx: object) => unknown) => callback({}) },
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

  it("replays a completed chart tool call without invoking the concrete executor", async () => {
    mocks.claimToolExecutionUsing.mockResolvedValue({ kind: "replay", output: { value: 7 } });
    const execute = vi.fn();
    const executor = createIdempotentToolExecutor(9, { execute });

    const output = await executor.execute({
      toolName: "createChart",
      input: { workbookId: "7", sheetId: "11", type: "line" },
      toolCallId: "call-1",
      context: {},
    });

    expect(output).toEqual({ value: 7 });
    expect(execute).not.toHaveBeenCalled();
    expect(mocks.completeToolExecutionUsing).not.toHaveBeenCalled();
  });

  it("records a newly executed tool result and failures", async () => {
    mocks.claimToolExecutionUsing.mockResolvedValue({ kind: "execute" });
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const executor = createIdempotentToolExecutor(9, { execute });

    await expect(
      executor.execute({
        toolName: "writeCells",
        input: { sheetId: 3 },
        toolCallId: "call-1",
        context: {},
      }),
    ).resolves.toEqual({ ok: true });
    expect(mocks.completeToolExecutionUsing).toHaveBeenCalledWith({}, 9, "call-1", { ok: true });

    const failure = new Error("tool failed");
    execute.mockRejectedValueOnce(failure);
    await expect(
      executor.execute({
        toolName: "writeCells",
        input: { sheetId: 3 },
        toolCallId: "call-2",
        context: {},
      }),
    ).rejects.toThrow("tool failed");
    expect(mocks.failToolExecutionUsing).toHaveBeenCalledWith({}, 9, "call-2", failure);
  });

  it("does not mark a successful mutation failed when ledger completion fails", async () => {
    mocks.claimToolExecutionUsing.mockResolvedValue({ kind: "execute" });
    const output = { chartId: "chart-1" };
    mocks.completeToolExecutionUsing.mockRejectedValue(new Error("ledger unavailable"));
    const execute = vi.fn().mockResolvedValue(output);
    const executor = createIdempotentToolExecutor(9, { execute });

    const result = executor.execute({
      toolName: "createChart",
      input: { sheetId: 11 },
      toolCallId: "call-3",
      context: {},
    });
    await expect(result).rejects.toBeInstanceOf(AgentPersistenceError);
    await expect(result).rejects.toThrow("ledger unavailable");

    expect(execute).toHaveBeenCalledOnce();
    expect(mocks.failToolExecutionUsing).not.toHaveBeenCalled();
  });
});
