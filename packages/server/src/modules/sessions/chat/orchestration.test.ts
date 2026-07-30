import { type ExcelToolName, excelToolSpecs } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import type { ServerToolRegistry } from "../../../shared/tools/registry.js";
import { buildToolContexts, createServerToolRegistry } from "../../../shared/tools/registry.js";
import { defineServerTool } from "../../../shared/tools/serverTool.js";
import { buildRunToolset, createConcreteToolExecutor } from "./orchestration.js";

describe("buildRunToolset", () => {
  it("binds run-scoped tools to the active run", () => {
    const { toolsContext } = buildRunToolset(3, 19);

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
        persistenceMode: name === "createChart" ? "mutation" : "read",
        resultBudget: { maxTokens: 1_000, compact: (value) => value },
        execute: async (input, options) => {
          if (name === "createChart") {
            await execute(input, options);
            return { success: true, chartId: "chart-1", workbookId: 1, sheetId: 10 };
          }
          return undefined as never;
        },
      }),
    );
    const registry = createServerToolRegistry(fakeManifest) as ServerToolRegistry;
    const contexts = buildToolContexts(3, 19);

    const request = {
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
    } as const;

    await expect(createConcreteToolExecutor(registry, contexts).execute(request)).resolves.toEqual({
      success: true,
      chartId: "chart-1",
      workbookId: 1,
      sheetId: 10,
    });

    const invalidRegistry: ServerToolRegistry = {
      ...registry,
      createChart: {
        ...registry.createChart,
        execute: async () => ({ success: true }),
      },
    };
    await expect(
      createConcreteToolExecutor(invalidRegistry, contexts).execute(request),
    ).rejects.toThrow("createChart: 输出结果验证失败");
  });

  it("rejects invalid tool input before invoking the concrete executor", async () => {
    const execute = vi.fn();
    const fakeManifest = (Object.keys(excelToolSpecs) as ExcelToolName[]).map((name) =>
      defineServerTool(name, {
        persistenceMode: "read",
        resultBudget: { maxTokens: 1_000, compact: (value) => value },
        execute: async () => undefined as never,
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

  it("rejects invalid tool context before invoking the concrete executor", async () => {
    const execute = vi.fn();
    const fakeManifest = (Object.keys(excelToolSpecs) as ExcelToolName[]).map((name) =>
      defineServerTool(name, {
        persistenceMode: "read",
        resultBudget: { maxTokens: 1_000, compact: (value) => value },
        execute: async () => {
          execute();
          return undefined as never;
        },
      }),
    );
    const registry = createServerToolRegistry(fakeManifest);
    const contexts = buildToolContexts(3, 19);

    await expect(
      createConcreteToolExecutor(registry, contexts).execute({
        toolName: "readSheetData",
        input: { sheetId: 7, operation: "overview" },
        toolCallId: "call-1",
        context: { toolContexts: { readSheetData: {} } },
      }),
    ).rejects.toThrow("readSheetData: 执行上下文验证失败");
    expect(execute).not.toHaveBeenCalled();
  });
});
