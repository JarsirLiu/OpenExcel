import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  isLoopFinished: vi.fn(() => "loop-finished"),
  streamText: vi.fn(),
  generateText: vi.fn(
    async (): Promise<{ output: unknown; usage: { inputTokens: number } }> => ({
      output: undefined,
      usage: { inputTokens: 10 },
    }),
  ),
  Output: { object: vi.fn((value: unknown) => value) },
  tool: vi.fn((definition: unknown) => definition),
  validateUIMessages: vi.fn(async ({ messages }: { messages: unknown }) => messages),
}));

vi.mock("ai", () => mocks);
vi.mock("../../model.js", () => ({
  createChatModel: vi.fn(() => ({ modelId: "test-model" })),
  resolveModelForPurpose: vi.fn(() => ({ modelId: "test-model" })),
}));

import { runAgentLoop } from "./agentLoop.js";

function createModelStream(options: {
  tools: Record<string, { execute: (input: unknown, toolOptions: unknown) => Promise<unknown> }>;
  onStepFinish: (step: unknown) => Promise<void>;
  onStepStart: (step: unknown) => Promise<void>;
  onChunk?: (event: { chunk: unknown }) => Promise<void>;
  abortSignal?: AbortSignal;
}) {
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => {
    resolveDone = resolve;
  });
  const stream = new ReadableStream({
    start(controller) {
      void (async () => {
        await options.onStepStart({ stepNumber: 0 });
        await options.onChunk?.({
          chunk: { type: "tool-input-start", id: "call-1", toolName: "readSheetData" },
        });
        const toolOutput = await options.tools.readSheetData.execute(
          { sheetId: 7 },
          { toolCallId: "call-1", abortSignal: options.abortSignal },
        );
        await options.onStepFinish({ toolOutput });
        await options.onChunk?.({ chunk: { type: "text-delta", id: "text-1", text: "完成" } });
        controller.close();
        resolveDone();
      })();
    },
  });
  return { stream, done };
}

describe("runAgentLoop", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("passes retry, timeout, and cancellation policy to the model SDK", async () => {
    const abortController = new AbortController();
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    mocks.streamText.mockReturnValue({
      stream,
      text: Promise.resolve("完成"),
      responseMessages: Promise.resolve([]),
    });

    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "继续" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [],
      toolExecutor: { execute: vi.fn() },
      maxRetries: 4,
      timeout: { totalMs: 15_000, chunkMs: 5_000 },
      abortSignal: abortController.signal,
    } as any);

    await result.completion;

    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({
        maxRetries: 4,
        timeout: { totalMs: 15_000, chunkMs: 5_000 },
        abortSignal: expect.any(AbortSignal),
        include: { requestMessages: true },
      }),
    );
  });

  it("reports provider input usage at the model step boundary", async () => {
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    mocks.streamText.mockImplementation((options: any) => ({
      stream: new ReadableStream({
        start(controller) {
          void (async () => {
            await options.onStepStart({ stepNumber: 0 });
            await options.onStepFinish({
              stepNumber: 0,
              finishReason: "stop",
              usage: { inputTokens: 42, outputTokens: 5 },
              content: [],
            });
            resolveDone();
            controller.close();
          })();
        },
      }),
      text: done.then(() => "完成"),
      responseMessages: done.then(() => []),
    }));

    const onModelStepFinished = vi.fn();
    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "继续" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [],
      toolExecutor: { execute: vi.fn() },
      onModelStepFinished,
    } as any);

    await result.completion;

    expect(onModelStepFinished).toHaveBeenCalledWith(
      expect.objectContaining({
        stepIndex: 0,
        usage: expect.objectContaining({
          inputTokens: 42,
          outputTokens: 5,
          source: "provider",
        }),
        observation: { inputTokens: 42, source: "provider", measuredAtStep: 0 },
      }),
    );
  });

  it("uses SDK request messages once and applies per-step active tools", async () => {
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    const requestMessages = [{ role: "user", content: [{ type: "text", text: "读取" }] }];
    const nextStepMessages = [
      ...requestMessages,
      {
        role: "assistant",
        content: [
          { type: "tool-call", toolName: "readSheetData", toolCallId: "call-1", input: {} },
        ],
      },
      {
        role: "tool",
        content: [
          { type: "tool-result", toolName: "readSheetData", toolCallId: "call-1", output: "x" },
        ],
      },
    ];
    mocks.streamText.mockImplementation((options: any) => ({
      stream: new ReadableStream({
        start(controller) {
          void (async () => {
            await options.onStepStart({
              stepNumber: 0,
              messages: requestMessages,
              instructions: "system",
              activeTools: ["readSheetData", "writeSheetData"],
            });
            await options.onStepFinish({
              stepNumber: 0,
              finishReason: "tool-calls",
              usage: { inputTokens: 100 },
              content: [
                { type: "tool-call", toolName: "readSheetData", toolCallId: "call-1" },
                {
                  type: "tool-result",
                  toolName: "readSheetData",
                  toolCallId: "call-1",
                  output: "x",
                },
              ],
              toolResults: [{ output: "x" }],
              request: { messages: requestMessages },
            });
            await options.onStepStart({
              stepNumber: 1,
              messages: nextStepMessages,
              instructions: "system",
              activeTools: ["readSheetData"],
            });
            await options.onStepFinish({
              stepNumber: 1,
              finishReason: "stop",
              usage: { inputTokens: 140 },
              content: [],
              request: { messages: nextStepMessages },
            });
            resolveDone();
            controller.close();
          })();
        },
      }),
      text: done.then(() => "完成"),
      responseMessages: done.then(() => []),
    }));

    const persisted: Array<{ type: string; payload: any }> = [];
    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "读取" }] } },
      ],
      systemPrompt: "system",
      workspace: [],
      tools: [
        { name: "readSheetData", description: "读取", inputSchema: {} },
        { name: "writeSheetData", description: "写入", inputSchema: {} },
      ],
      toolExecutor: { execute: vi.fn() },
      persistenceBarrier: { persist: vi.fn((event) => persisted.push(event)) },
    } as any);

    await result.completion;

    const started = persisted.filter((event) => event.type === "step.started");
    const finished = persisted.filter((event) => event.type === "step.finished");
    expect(started).toHaveLength(2);
    expect(finished).toHaveLength(2);
    expect(started[1]?.payload.estimatedContextTokens).toBeGreaterThan(
      started[0]?.payload.estimatedContextTokens,
    );
    expect(finished[0]?.payload.estimatedContextTokens).toBeLessThan(
      started[1]?.payload.estimatedContextTokens,
    );
    expect(started[1]?.payload.tokenObservation).toMatchObject({ source: "mixed" });
  });

  it("stops before model execution when the persistence barrier rejects", async () => {
    const execute = vi.fn();
    const input = {
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "读取数据" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [],
      toolExecutor: { execute },
      persistenceBarrier: {
        persist: vi.fn().mockRejectedValue(new Error("persistence unavailable")),
      },
    } as any;

    await expect(runAgentLoop(input)).rejects.toThrow("persistence unavailable");
    expect(mocks.streamText).not.toHaveBeenCalled();
    expect(execute).not.toHaveBeenCalled();
  });

  it("runs tools inside the agent package and exposes completion separately from the UI stream", async () => {
    mocks.streamText.mockImplementation((options: any) => {
      const model = createModelStream(options);
      return {
        stream: model.stream,
        text: model.done.then(() => "完成"),
        responseMessages: model.done.then(() => [
          {
            role: "assistant",
            content: [
              { type: "text", text: "完成" },
              {
                type: "tool-call",
                toolName: "readSheetData",
                toolCallId: "call-1",
                input: { sheetId: 7 },
              },
            ],
          },
          {
            role: "tool",
            content: [
              {
                type: "tool-result",
                toolName: "readSheetData",
                toolCallId: "call-1",
                output: { cells: [[1]] },
              },
            ],
          },
        ]),
      };
    });

    const eventTypes: string[] = [];
    const persistedTypes: string[] = [];
    const publishedTypes: string[] = [];
    const execute = vi.fn().mockResolvedValue({ cells: [[1]] });
    const input = {
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "读取数据" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [
        {
          name: "readSheetData",
          description: "读取 Sheet 数据",
          inputSchema: {},
        },
      ],
      toolExecutor: { execute },
      executionContext: { workbookId: 1 },
      eventSink: { publish: vi.fn((event) => publishedTypes.push(event.type)) },
      persistenceBarrier: { persist: vi.fn((event) => persistedTypes.push(event.type)) },
    } as any;

    const result = await runAgentLoop(input);
    const completion = await result.completion;

    for (const type of persistedTypes) eventTypes.push(type);

    expect(completion).toMatchObject({ status: "completed", text: "完成", isAborted: false });
    expect(completion.messages).toEqual([
      expect.objectContaining({
        role: "user",
      }),
      expect.objectContaining({
        role: "assistant",
        parts: expect.arrayContaining([
          expect.objectContaining({
            type: "tool-readSheetData",
            state: "output-available",
            output: { cells: [[1]] },
          }),
        ]),
      }),
    ]);
    expect(execute).toHaveBeenCalledWith(
      expect.objectContaining({
        toolName: "readSheetData",
        input: { sheetId: 7 },
        context: { workbookId: 1 },
        toolCallId: "call-1",
      }),
    );
    expect(eventTypes).toEqual([
      "run.started",
      "step.started",
      "tool.started",
      "tool.finished",
      "step.finished",
      "message.delta",
    ]);
    expect(publishedTypes).toEqual(eventTypes);
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ stopWhen: "loop-finished", tools: expect.any(Object) }),
    );
  });

  it("continues the model loop after a business tool failure", async () => {
    mocks.streamText.mockImplementation((options: any) => {
      const model = createModelStream(options);
      return {
        stream: model.stream,
        text: model.done.then(() => "工具失败后继续回答"),
        responseMessages: model.done.then(() => []),
      };
    });

    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "读取数据" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [
        {
          name: "readSheetData",
          description: "读取 Sheet 数据",
          inputSchema: {},
        },
      ],
      toolExecutor: { execute: vi.fn().mockRejectedValue(new Error("Sheet 不存在")) },
      eventSink: { publish: vi.fn() },
      persistenceBarrier: { persist: vi.fn() },
    } as any);

    await expect(result.completion).resolves.toMatchObject({
      status: "completed",
      text: "工具失败后继续回答",
    });
  });

  it("persists and publishes SDK 7 text and reasoning deltas", async () => {
    let resolveDone!: () => void;
    const done = new Promise<void>((resolve) => {
      resolveDone = resolve;
    });
    mocks.streamText.mockImplementation((options: any) => ({
      text: done.then(() => "回答"),
      responseMessages: done.then(() => []),
      stream: new ReadableStream({
        start(controller) {
          void (async () => {
            await options.onChunk({
              chunk: { type: "reasoning-delta", id: "reasoning-1", text: "先思考" },
            });
            await options.onChunk({
              chunk: { type: "text-delta", id: "text-1", text: "回答" },
            });
            resolveDone();
            controller.close();
          })();
        },
      }),
    }));

    const persisted: Array<{ type: string; payload: any }> = [];
    const published: Array<{ type: string; payload: any }> = [];
    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "继续" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [],
      toolExecutor: { execute: vi.fn() },
      eventSink: { publish: vi.fn((event) => published.push(event)) },
      persistenceBarrier: { persist: vi.fn((event) => persisted.push(event)) },
    } as any);

    await result.completion;

    expect(persisted.map((event) => event.type)).toContain("reasoning.delta");
    expect(persisted.map((event) => event.type)).toContain("message.delta");
    expect(published.map((event) => event.type)).toEqual(persisted.map((event) => event.type));
    expect(persisted.find((event) => event.type === "reasoning.delta")?.payload).toMatchObject({
      delta: "先思考",
    });
    expect(persisted.find((event) => event.type === "message.delta")?.payload).toMatchObject({
      delta: "回答",
      messageId: "run-assistant",
    });
    expect(persisted.find((event) => event.type === "reasoning.delta")?.payload).toMatchObject({
      messageId: "run-assistant",
    });
  });

  it("completes the run with a separate UI transport stream", async () => {
    mocks.streamText.mockImplementation((options: any) => {
      const model = createModelStream(options);
      return { stream: model.stream, text: model.done.then(() => "完成") };
    });

    const execute = vi.fn().mockResolvedValue({ cells: [[1]] });
    const input = {
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "读取数据" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [{ name: "readSheetData", description: "读取", inputSchema: {} }],
      toolExecutor: { execute },
      executionContext: {},
      eventSink: { publish: vi.fn() },
      persistenceBarrier: { persist: vi.fn() },
    } as any;

    const result = await runAgentLoop(input);
    const completion = await result.completion;

    expect(completion.status).toBe("completed");
    expect(execute).toHaveBeenCalled();
    expect(result.completion).toBeDefined();
  });

  it("passes the actual SDK error to the error callback", async () => {
    const providerError = Object.assign(new Error("provider rejected continuation"), {
      statusCode: 400,
      responseBody: JSON.stringify({ error: { message: "invalid tool message" } }),
    });

    mocks.streamText.mockImplementation((options: any) => {
      void options.onError({ error: providerError });
      return {
        stream: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
        text: Promise.reject(providerError),
        responseMessages: Promise.reject(providerError),
      };
    });

    const onError = vi.fn();
    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "继续" }] } },
      ],
      systemPrompt: "你是表格助手",
      workspace: [],
      tools: [],
      toolExecutor: { execute: vi.fn() },
      onError,
    } as any);

    await expect(result.completion).resolves.toMatchObject({
      status: "failed",
      error: providerError,
      failurePhase: "model",
    });
    expect(onError).toHaveBeenCalledWith(providerError);
  });
});
