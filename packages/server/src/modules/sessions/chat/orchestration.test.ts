import { describe, expect, it } from "vitest";
import { buildRunToolset } from "./orchestration.js";

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
});
