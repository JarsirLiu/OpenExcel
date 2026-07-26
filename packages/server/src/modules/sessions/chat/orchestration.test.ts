import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { ServerToolRegistry } from "../../../shared/tools/registry.js";
import { buildToolContexts, createServerToolRegistry } from "../../../shared/tools/registry.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
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
    const fakeManifest = (Object.keys(excelToolSpecs) as ExcelToolName[]).map((name) =>
      defineServerTool(name, {
        contextSchema: z.unknown(),
        outputSchema: z.unknown(),
        execute: async (input, options) => (name === "createChart" ? execute(input, options) : {}),
      }),
    );
    const registry = createServerToolRegistry(fakeManifest) as ServerToolRegistry;
    const contexts = buildToolContexts(3, 19);

    await expect(
      createConcreteToolExecutor(registry, contexts).execute({
        toolName: "createChart",
        input: {
          workbookId: 1,
          sheetId: 10,
          type: "line",
          anchor: {
            kind: "oneCell",
            from: { row: 1, col: 1 },
            widthEmu: 1000,
            heightEmu: 1000,
          },
          sourceRange: {
            sheetId: 10,
            startRow: 1,
            startCol: 1,
            endRow: 2,
            endCol: 1,
          },
        },
        toolCallId: "call-1",
        context: {},
        abortSignal: undefined,
      }),
    ).resolves.toEqual({
      chartId: "chart-1",
      createdAt: "2026-07-26T08:00:00.000Z",
    });
  });

  it("rejects invalid tool input before invoking the concrete executor", async () => {
    const execute = vi.fn();
    const fakeManifest = (Object.keys(excelToolSpecs) as ExcelToolName[]).map((name) =>
      defineServerTool(name, {
        contextSchema: z.unknown(),
        outputSchema: z.unknown(),
        execute,
      }),
    );
    const registry = createServerToolRegistry(fakeManifest);
    const contexts = buildToolContexts(3, 19);

    await expect(
      createConcreteToolExecutor(registry, contexts).execute({
        toolName: "readSheetData",
        input: {},
        toolCallId: "call-1",
        context: {},
      }),
    ).rejects.toThrow("readSheetData: 输入参数验证失败");
    expect(execute).not.toHaveBeenCalled();
  });
});
