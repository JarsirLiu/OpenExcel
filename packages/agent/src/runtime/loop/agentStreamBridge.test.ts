import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AgentProtocolError } from "../events/types.js";
import { ToolExecutionError } from "../tools/errors.js";
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

  it("starts a tool when the provider skips the input-start chunk", async () => {
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
      type: "tool-input-available",
      toolCallId: "call-early",
      toolName: "createChart",
      input: { workbookId: 7 },
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "tool.started",
      payload: {
        toolName: "createChart",
        toolCallId: "call-early",
        input: { workbookId: 7 },
      },
    });
  });

  it("turns provider input errors into a terminal failed tool event", async () => {
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

    await bridge.onChunk({
      type: "tool-input-error",
      toolCallId: "call-invalid",
      toolName: "createChart",
      input: { workbookId: "bad" },
      errorText: "workbookId must be a number",
    });

    expect(events.map((event) => event.type)).toEqual(["tool.started", "tool.finished"]);
    expect(events[1]).toMatchObject({
      payload: {
        outcome: "failed",
        error: {
          kind: "validation_failed",
          message: "workbookId must be a number",
        },
      },
    });
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
      toolExecutor: {
        execute: vi.fn().mockRejectedValue(new ToolExecutionError("创建失败")),
      },
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

  it("fails the run when a model step ends without a tool result", async () => {
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

    await bridge.onChunk({
      type: "tool-input-start",
      id: "call-pending",
      toolName: "readSheetData",
    });
    await expect(
      bridge.reconcileStep({
        toolCalls: [{ toolCallId: "call-pending", toolName: "readSheetData", input: {} }],
        toolResults: [],
      }),
    ).rejects.toBeInstanceOf(AgentProtocolError);

    expect(events).toEqual(["tool.started", "tool.finished"]);
  });

  it("fails the run when the provider finishes with an unresolved tool", async () => {
    const bridge = createAgentStreamBridge({
      tools: [
        {
          name: "readSheetData",
          description: "Read sheet data",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn() },
      executionContext: undefined,
      emitter: { emit: async () => ({}) as never },
      getStepIndex: () => 0,
    });

    await bridge.onChunk({
      type: "tool-input-start",
      toolCallId: "call-pending-finish",
      toolName: "readSheetData",
    });

    await expect(bridge.onFinish({})).rejects.toBeInstanceOf(AgentProtocolError);
    expect(bridge.getState()).toMatchObject({ aborted: false });
  });

  it("rejects malformed recognized provider tool chunks", async () => {
    const bridge = createAgentStreamBridge({
      tools: [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn() },
      executionContext: undefined,
      emitter: { emit: async () => ({}) as never },
      getStepIndex: () => 0,
    });

    await expect(
      bridge.onChunk({ type: "tool-input-start", toolName: "readSheetData" }),
    ).rejects.toBeInstanceOf(AgentProtocolError);
  });

  it("does not let an unexpected executor error continue through the model loop", async () => {
    const bridge = createAgentStreamBridge({
      tools: [
        {
          name: "readSheetData",
          description: "Read a sheet",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn().mockRejectedValue(new Error("programmer bug")) },
      executionContext: undefined,
      emitter: { emit: async () => ({}) as never },
      getStepIndex: () => 0,
    });

    await expect(
      (bridge.tools.readSheetData as any).execute({}, { toolCallId: "call-unexpected" }),
    ).rejects.toThrow("programmer bug");
    await expect(
      bridge.reconcileStep({
        toolCalls: [{ toolCallId: "call-unexpected", toolName: "readSheetData", input: {} }],
        toolResults: [
          { type: "tool-error", toolCallId: "call-unexpected", error: "programmer bug" },
        ],
      }),
    ).rejects.toThrow("programmer bug");
    expect(bridge.getState()).toMatchObject({ failurePhase: "tool" });
  });

  it("preserves an unexpected tool error when the provider reports a follow-up error", async () => {
    const toolError = new Error("programmer bug");
    const providerError = new Error("provider stopped after tool failure");
    const bridge = createAgentStreamBridge({
      tools: [
        {
          name: "readSheetData",
          description: "Read sheet data",
          inputSchema: z.object({}),
        },
      ],
      toolExecutor: { execute: vi.fn().mockRejectedValue(toolError) },
      executionContext: undefined,
      emitter: { emit: async () => ({}) as never },
      getStepIndex: () => 0,
    });

    await expect(
      (bridge.tools.readSheetData as any).execute({}, { toolCallId: "call-root-cause" }),
    ).rejects.toBe(toolError);
    await bridge.onError({ error: providerError });

    expect(bridge.getState()).toMatchObject({ loopError: toolError, failurePhase: "tool" });
  });
});
