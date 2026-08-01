import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentProtocolError } from "../events/types.js";
import { ToolExecutionError } from "./errors.js";
import { createAgentToolSet } from "./toolAdapter.js";

describe("createAgentToolSet", () => {
  it("routes AI SDK tool execution through the injected executor", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const onToolStart = vi.fn();
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({ sheetId: z.number() }),
        },
      ],
      { execute },
      { tenant: "opaque" },
      { onToolStart, onToolFinish },
    );

    const output = await (tools.readSheetData as any).execute(
      { sheetId: 7 },
      { toolCallId: "call-1", abortSignal: undefined },
    );

    expect(output).toEqual({ ok: true });
    expect(execute).toHaveBeenCalledWith({
      toolName: "readSheetData",
      input: { sheetId: 7 },
      toolCallId: "call-1",
      abortSignal: undefined,
      context: { tenant: "opaque" },
    });
    expect(onToolStart).toHaveBeenCalledWith({
      toolName: "readSheetData",
      toolCallId: "call-1",
      input: { sheetId: 7 },
    });
    expect(onToolFinish).toHaveBeenCalledWith({
      toolName: "readSheetData",
      toolCallId: "call-1",
      input: { sheetId: 7 },
      output: { ok: true },
      source: "adapter",
    });
  });

  it("returns a model-visible error when adapter input validation fails", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({ sheetId: z.number() }),
        },
      ],
      { execute },
      undefined,
      { onToolFinish },
    );

    await expect(
      (tools.readSheetData as any).execute(
        { sheetId: "7" },
        { toolCallId: "call-2", abortSignal: undefined },
      ),
    ).resolves.toMatchObject({
      isError: true,
      error: { kind: "validation_failed" },
    });
    expect(execute).not.toHaveBeenCalled();
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: "call-2", error: expect.anything() }),
    );
  });

  it("normalizes executor output before it enters the AI SDK loop", async () => {
    const tools = createAgentToolSet(
      [{ name: "createChart", description: "Create a chart", inputSchema: z.object({}) }],
      {
        execute: vi.fn().mockResolvedValue({
          chartId: "chart-1",
          createdAt: new Date("2026-07-26T08:00:00.000Z"),
        }),
      },
      undefined,
    );

    await expect(
      (tools.createChart as any).execute({}, { toolCallId: "call-chart", abortSignal: undefined }),
    ).resolves.toEqual({
      chartId: "chart-1",
      createdAt: "2026-07-26T08:00:00.000Z",
    });
  });

  it("returns a model-visible error result when tool execution fails", async () => {
    const execute = vi.fn().mockRejectedValue(new ToolExecutionError("Sheet 不存在"));
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({ sheetId: z.number() }),
        },
      ],
      { execute },
      undefined,
      { onToolFinish },
    );

    await expect(
      (tools.readSheetData as any).execute(
        { sheetId: 7 },
        { toolCallId: "call-tool-error", abortSignal: undefined },
      ),
    ).resolves.toEqual({
      isError: true,
      error: { kind: "execution_failed", message: "Sheet 不存在", retryable: false },
    });
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({ toolCallId: "call-tool-error", error: expect.anything() }),
    );
  });

  it("rejects calls beyond the parallel execution limit as model-visible results", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn().mockImplementation(() => blocker);
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [{ name: "readSheetData", description: "Read a sheet", inputSchema: z.object({}) }],
      { execute },
      undefined,
      { onToolFinish },
    );

    const calls = Array.from({ length: 11 }, (_, index) =>
      (tools.readSheetData as any).execute({}, { toolCallId: `call-${index}` }),
    );
    await Promise.resolve();
    await expect(calls[10]).resolves.toMatchObject({
      isError: true,
      error: {
        kind: "rate_limit",
        details: { maxParallelToolCalls: 10 },
        retryable: true,
      },
    });
    expect(execute).toHaveBeenCalledTimes(10);

    release();
    await Promise.all(calls.slice(0, 10));
    expect(onToolFinish).toHaveBeenCalledTimes(11);

    (tools as any).resetToolCallBatch();
    await expect(
      (tools.readSheetData as any).execute({}, { toolCallId: "call-next-batch" }),
    ).resolves.toBeNull();
    expect(execute).toHaveBeenCalledTimes(11);
  });

  it("admits only one mutation tool per model step while allowing read tools to use the normal gate", async () => {
    let release!: () => void;
    const blocker = new Promise<void>((resolve) => {
      release = resolve;
    });
    const execute = vi.fn().mockImplementation(async ({ toolName }: { toolName: string }) => {
      if (toolName === "writeCells") await blocker;
      return { toolName };
    });
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [
        {
          name: "writeCells",
          description: "Write cells",
          inputSchema: z.object({}),
          executionMode: "mutation",
        },
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({}),
          executionMode: "read",
        },
        {
          name: "createChart",
          description: "Create a chart",
          inputSchema: z.object({}),
          executionMode: "mutation",
        },
      ],
      { execute },
      undefined,
      { onToolFinish },
    );

    const firstWrite = (tools.writeCells as any).execute({}, { toolCallId: "write-1" });
    await Promise.resolve();
    const secondWrite = await (tools.createChart as any).execute({}, { toolCallId: "write-2" });
    const read = await (tools.readSheetData as any).execute({}, { toolCallId: "read-1" });

    expect(secondWrite).toMatchObject({
      isError: true,
      error: {
        kind: "rate_limit",
        details: { maxMutationToolsPerStep: 1 },
      },
    });
    expect(read).toEqual({ toolName: "readSheetData" });
    expect(execute).toHaveBeenCalledTimes(2);

    release();
    await firstWrite;
    (tools as any).resetToolCallBatch();

    await expect(
      (tools.createChart as any).execute({}, { toolCallId: "write-3" }),
    ).resolves.toEqual({ toolName: "createChart" });
  });

  it("rethrows unexpected executor errors instead of hiding them from diagnostics", async () => {
    const execute = vi.fn().mockRejectedValue(new Error("programmer bug"));
    const onToolFinish = vi.fn();
    const tools = createAgentToolSet(
      [{ name: "readSheetData", description: "Read a sheet", inputSchema: z.object({}) }],
      { execute },
      undefined,
      { onToolFinish },
    );

    await expect(
      (tools.readSheetData as any).execute({}, { toolCallId: "call-unexpected" }),
    ).rejects.toThrow("programmer bug");
    expect(onToolFinish).toHaveBeenCalledWith(
      expect.objectContaining({
        toolCallId: "call-unexpected",
        error: expect.objectContaining({ message: "programmer bug" }),
      }),
    );
  });

  it("rejects tool execution without a provider call id", async () => {
    const execute = vi.fn();
    const tools = createAgentToolSet(
      [{ name: "readSheetData", description: "Read a sheet", inputSchema: z.object({}) }],
      { execute },
      undefined,
    );

    await expect((tools.readSheetData as any).execute({}, {})).rejects.toBeInstanceOf(
      AgentProtocolError,
    );
    expect(execute).not.toHaveBeenCalled();
  });

  it("does not start a tool after the agent run is cancelled", async () => {
    const execute = vi.fn();
    const controller = new AbortController();
    controller.abort();
    const tools = createAgentToolSet(
      [{ name: "readSheetData", description: "Read a sheet", inputSchema: z.object({}) }],
      { execute },
      undefined,
    );

    await expect(
      (tools.readSheetData as any).execute(
        {},
        {
          toolCallId: "call-cancelled",
          abortSignal: controller.signal,
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(execute).not.toHaveBeenCalled();
  });

  it("finishes a started tool when the agent run is cancelled", async () => {
    const execute = vi.fn(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise<void>((resolve, reject) => {
          if (!abortSignal) throw new Error("missing abort signal");
          abortSignal.addEventListener("abort", () => reject(abortSignal.reason), { once: true });
          void resolve;
        }),
    );
    const onToolFinish = vi.fn();
    const controller = new AbortController();
    const tools = createAgentToolSet(
      [{ name: "writeCells", description: "Write cells", inputSchema: z.object({}) }],
      { execute },
      undefined,
      { onToolFinish },
    );

    const execution = (tools.writeCells as any).execute(
      {},
      { toolCallId: "call-cancel-during-execution", abortSignal: controller.signal },
    );
    await Promise.resolve();
    controller.abort();

    await expect(execution).rejects.toMatchObject({ name: "AbortError" });
    expect(onToolFinish).toHaveBeenCalledWith({
      toolName: "writeCells",
      toolCallId: "call-cancel-during-execution",
      input: {},
      error: { kind: "cancelled", message: "工具执行已中断" },
      source: "adapter",
    });
  });
});
