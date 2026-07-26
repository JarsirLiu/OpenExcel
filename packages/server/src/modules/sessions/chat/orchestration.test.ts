import { describe, expect, it, vi } from "vitest";
import { buildRunToolset, createConcreteToolExecutor } from "./orchestration.js";

describe("buildRunToolset", () => {
  it("binds run-scoped tools to the active run", () => {
    const { toolsContext } = buildRunToolset(
      {
        baseUrl: "http://model",
        apiKey: "test-key",
        modelName: "test-model",
        maxRetries: 2,
        timeoutMs: 120_000,
        chunkTimeoutMs: 30_000,
        contextWindowTokens: 180_000,
        outputReserveTokens: 16_000,
        maxConversationTurns: 20,
        maxUserInputTokens: 16_000,
        toolResultBudgetTokens: 10_000,
        toolResultMaxTokens: 4_000,
        readSheetDataBudgetTokens: 4_000,
      },
      3,
      19,
    );

    expect(toolsContext.readSheetData).toEqual({ workspaceId: 3 });
    expect(toolsContext.createChart).toEqual({ runId: 19, workspaceId: 3 });
    expect(toolsContext.writeCells).toEqual({ runId: 19, workspaceId: 3 });
  });

  it("normalizes concrete tool output before the idempotent executor persists it", async () => {
    const execute = vi.fn().mockResolvedValue({
      chartId: "chart-1",
      createdAt: new Date("2026-07-26T08:00:00.000Z"),
    });
    const executor = createConcreteToolExecutor(
      { createChart: { execute } } as any,
      { createChart: { workspaceId: 3 } } as any,
    );

    await expect(
      executor.execute(
        "createChart",
        {},
        { toolCallId: "call-1", context: {}, abortSignal: undefined },
      ),
    ).resolves.toEqual({
      chartId: "chart-1",
      createdAt: "2026-07-26T08:00:00.000Z",
    });
  });
});
