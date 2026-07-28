import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createAgentStreamBridge } from "./agentStreamBridge.js";

describe("createAgentStreamBridge", () => {
  it("emits tool.started when the model begins streaming tool input", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const bridge = createAgentStreamBridge({
      turnId: "turn-1",
      tools: [
        {
          name: "createChart",
          description: "Create a chart",
          inputSchema: z.object({ workbookId: z.number() }),
        },
      ],
      toolExecutor: { execute: vi.fn().mockResolvedValue({ chartId: "chart-1" }) },
      executionContext: undefined,
      emitter: {
        emit: async (type, payload) => {
          events.push({ type, payload: payload as Record<string, unknown> });
          return {} as never;
        },
      },
      getStepIndex: () => 0,
    });

    await bridge.onChunk({
      type: "tool-input-start",
      id: "call-early",
      toolName: "createChart",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool.started",
      payload: {
        toolName: "createChart",
        toolCallId: "call-early",
        input: {},
      },
    });

    await (bridge.tools.createChart as any).execute(
      { workbookId: 7 },
      { toolCallId: "call-early" },
    );

    expect(events.map((event) => event.type)).toEqual(["tool.started", "tool.finished"]);
    expect(events[1].payload).toMatchObject({ input: { workbookId: 7 } });
  });

  it("reconciles invalid tool calls from the completed model step", async () => {
    const events: Array<{ type: string; payload: Record<string, unknown> }> = [];
    const bridge = createAgentStreamBridge({
      turnId: "turn-1",
      tools: [
        {
          name: "createChart",
          description: "Create a chart",
          inputSchema: z.object({ workbookId: z.number() }),
        },
      ],
      toolExecutor: { execute: vi.fn() },
      executionContext: undefined,
      emitter: {
        emit: async (type, payload) => {
          events.push({ type, payload: payload as Record<string, unknown> });
          return {} as never;
        },
      },
      getStepIndex: () => 0,
    });

    await bridge.reconcileStep({
      toolCalls: [
        {
          toolCallId: "call-invalid",
          toolName: "createChart",
          input: "{bad json",
          invalid: true,
        },
      ],
      toolResults: [
        {
          type: "tool-error",
          toolCallId: "call-invalid",
          toolName: "createChart",
          input: "{bad json",
          error: "工具参数解析失败",
        },
      ],
    });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      type: "tool.started",
      payload: { toolCallId: "call-invalid", toolName: "createChart" },
    });
    expect(events[1]).toMatchObject({
      type: "tool.finished",
      payload: {
        toolCallId: "call-invalid",
        toolName: "createChart",
        input: "{bad json",
        error: { kind: "tool_call_failed", message: "工具参数解析失败" },
      },
    });
  });

  it("does not duplicate an adapter error when the SDK emits a tool-error chunk", async () => {
    const events: string[] = [];
    const bridge = createAgentStreamBridge({
      turnId: "turn-1",
      tools: [
        {
          name: "createChart",
          description: "Create a chart",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn().mockRejectedValue(new Error("创建失败")) },
      executionContext: undefined,
      emitter: {
        emit: async (type) => {
          events.push(type);
          return {} as never;
        },
      },
      getStepIndex: () => 0,
    });

    await (bridge.tools.createChart as any).execute({}, { toolCallId: "call-1" });
    await bridge.onChunk({
      type: "tool-error",
      toolCallId: "call-1",
      toolName: "createChart",
      input: {},
      error: new Error("创建失败"),
    });

    expect(events).toEqual(["tool.started", "tool.finished"]);
  });

  it("closes a started tool when a model step ends without a result", async () => {
    const events: string[] = [];
    const bridge = createAgentStreamBridge({
      turnId: "turn-1",
      tools: [
        {
          name: "readSheetData",
          description: "Read sheet data",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn() },
      executionContext: undefined,
      emitter: {
        emit: async (type) => {
          events.push(type);
          return {} as never;
        },
      },
      getStepIndex: () => 0,
    });

    await (bridge.tools.readSheetData as any).execute({}, { toolCallId: "call-pending" });
    await bridge.reconcileStep({
      toolCalls: [{ toolCallId: "call-pending", toolName: "readSheetData", input: {} }],
      toolResults: [],
    });

    expect(events).toEqual(["tool.started", "tool.finished"]);
  });
});
