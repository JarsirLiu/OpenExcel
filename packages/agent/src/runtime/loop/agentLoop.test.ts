import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  isLoopFinished: vi.fn(() => "loop-finished"),
  streamText: vi.fn(),
  toUIMessageStream: vi.fn(),
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
  abortSignal?: AbortSignal;
}) {
  return new ReadableStream({
    async pull(controller) {
      const toolOutput = await options.tools.readSheetData.execute(
        { sheetId: 7 },
        { toolCallId: "call-1", abortSignal: options.abortSignal },
      );
      await options.onStepFinish({ toolOutput });
      controller.enqueue({ type: "text-delta", textDelta: "完成" });
      controller.close();
    },
  });
}

function setupUIStreamAdapter() {
  mocks.toUIMessageStream.mockImplementation(
    (options: {
      stream: ReadableStream<unknown>;
      originalMessages: unknown[];
      onEnd: (event: { messages: unknown[]; isAborted: boolean }) => Promise<void>;
    }) => {
      const reader = options.stream.getReader();
      let ended = false;

      return new ReadableStream({
        async pull(controller) {
          const result = await reader.read();
          if (!result.done) {
            controller.enqueue(result.value);
            return;
          }

          if (!ended) {
            ended = true;
            await options.onEnd({
              messages: [...options.originalMessages, { role: "assistant", parts: [] }],
              isAborted: false,
            });
          }
          controller.close();
        },
      });
    },
  );
}

describe("runAgentLoop", () => {
  it("stops before model execution when the persistence barrier rejects", async () => {
    const execute = vi.fn();
    const input = {
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [{ role: "user", parts: [{ type: "text", text: "读取数据" }] }],
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
    setupUIStreamAdapter();
    mocks.streamText.mockImplementation((options: any) => ({
      stream: createModelStream(options),
      text: Promise.resolve("完成"),
    }));

    const eventTypes: string[] = [];
    const persistedTypes: string[] = [];
    const publishedTypes: string[] = [];
    const execute = vi.fn().mockResolvedValue({ cells: [[1]] });
    const input = {
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [{ role: "user", parts: [{ type: "text", text: "读取数据" }] }],
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
    const reader = result.stream.getReader();
    while (!(await reader.read()).done) {
      // Drain the transport projection so the loop can reach onEnd.
    }
    const completion = await result.completion;

    for (const type of persistedTypes) eventTypes.push(type);

    expect(completion).toMatchObject({ status: "completed", text: "完成", isAborted: false });
    expect(execute).toHaveBeenCalledWith(
      "readSheetData",
      { sheetId: 7 },
      expect.objectContaining({ context: { workbookId: 1 }, toolCallId: "call-1" }),
    );
    expect(eventTypes).toEqual([
      "run.started",
      "tool.started",
      "tool.finished",
      "step.finished",
      "run.completed",
    ]);
    expect(publishedTypes).toEqual(eventTypes);
    expect(mocks.streamText).toHaveBeenCalledWith(
      expect.objectContaining({ stopWhen: "loop-finished", tools: expect.any(Object) }),
    );
  });
});
