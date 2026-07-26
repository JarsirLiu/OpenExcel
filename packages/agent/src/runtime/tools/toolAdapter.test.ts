import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
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
    const execute = vi.fn().mockRejectedValue(new Error("Sheet 不存在"));
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

  it("rejects tool execution without a provider call id", async () => {
    const execute = vi.fn();
    const tools = createAgentToolSet(
      [{ name: "readSheetData", description: "Read a sheet", inputSchema: z.object({}) }],
      { execute },
      undefined,
    );

    await expect((tools.readSheetData as any).execute({}, {})).rejects.toThrow(
      "missing toolCallId",
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
    });
  });
});
