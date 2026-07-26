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
    expect(execute).toHaveBeenCalledWith(
      "readSheetData",
      { sheetId: 7 },
      {
        toolCallId: "call-1",
        abortSignal: undefined,
        context: { tenant: "opaque" },
      },
    );
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

  it("allows callers to disable adapter-level input validation", async () => {
    const execute = vi.fn().mockResolvedValue({ ok: true });
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
      {},
      { validateInput: false },
    );

    await (tools.readSheetData as any).execute(
      { sheetId: "7" },
      { toolCallId: "call-2", abortSignal: undefined },
    );

    expect(execute).toHaveBeenCalledWith(
      "readSheetData",
      { sheetId: "7" },
      expect.objectContaining({ toolCallId: "call-2" }),
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
});
