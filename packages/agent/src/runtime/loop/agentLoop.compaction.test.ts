import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  convertToModelMessages: vi.fn(async (messages: unknown) => messages),
  generateText: vi.fn(),
  isLoopFinished: vi.fn(() => "loop-finished"),
  Output: { object: vi.fn((value: unknown) => value) },
  streamText: vi.fn(),
  tool: vi.fn((definition: unknown) => definition),
  validateUIMessages: vi.fn(async ({ messages }: { messages: unknown }) => messages),
}));

vi.mock("ai", () => mocks);
vi.mock("../../model.js", () => ({
  resolveModelForPurpose: vi.fn(() => ({ modelId: "test-model" })),
}));

import { runAgentLoop } from "./agentLoop.js";

describe("runAgentLoop compaction lifecycle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("uses the compacted context for the next step without persisting the summary", async () => {
    const summary = {
      goal: ["继续当前任务"],
      constraints: [],
      completed: ["已完成旧步骤"],
      inProgress: ["正在处理当前步骤"],
      blocked: [],
      decisions: [],
      nextSteps: ["继续回答"],
      criticalFacts: ["关键事实"],
      references: [],
    };
    mocks.generateText.mockResolvedValue({ output: summary, usage: { inputTokens: 12 } });

    let checkpoint: any;
    const checkpointStore = {
      load: vi.fn(async () => checkpoint ?? null),
      save: vi.fn(async ({ checkpoint: next, expectedVersion }: any) => {
        if ((checkpoint?.version ?? null) !== expectedVersion) {
          return { accepted: false, current: checkpoint };
        }
        checkpoint = next;
        return { accepted: true };
      }),
    };
    let preparedContext: any;
    let resolvePrepared!: () => void;
    let rejectPrepared!: (error: unknown) => void;
    const prepared = new Promise<void>((resolve, reject) => {
      resolvePrepared = resolve;
      rejectPrepared = reject;
    });

    mocks.streamText.mockImplementation((options: any) => ({
      text: (async () => {
        try {
          const initialMessages = options.messages;
          await options.onStepStart({
            stepNumber: 0,
            messages: initialMessages,
            instructions: options.system,
            activeTools: [],
          });
          await options.onStepFinish({
            stepNumber: 0,
            finishReason: "stop",
            usage: { inputTokens: 5_000 },
            response: {
              messages: [
                {
                  role: "assistant",
                  content: [{ type: "text", text: "旧步骤结果" }],
                },
              ],
            },
            request: { messages: initialMessages },
          });
          preparedContext = await options.prepareStep({
            messages: initialMessages,
            instructions: options.system,
            activeTools: [],
          });
          resolvePrepared();
          return "完成";
        } catch (error) {
          rejectPrepared(error);
          throw error;
        }
      })(),
      responseMessages: Promise.resolve([]),
    }));

    const result = await runAgentLoop({
      modelConfig: { baseUrl: "http://model", apiKey: "test-key", modelName: "test-model" },
      transcript: [
        { cursor: 0, message: { role: "user", parts: [{ type: "text", text: "旧请求一" }] } },
        {
          cursor: 1,
          message: { role: "assistant", parts: [{ type: "text", text: "旧回答一" }] },
        },
        { cursor: 2, message: { role: "user", parts: [{ type: "text", text: "旧请求二" }] } },
        {
          cursor: 3,
          message: { role: "assistant", parts: [{ type: "text", text: "旧回答二" }] },
        },
        { cursor: 4, message: { role: "user", parts: [{ type: "text", text: "当前请求" }] } },
      ],
      systemPrompt: "system",
      workspace: [],
      tools: [],
      toolExecutor: { execute: vi.fn() },
      compaction: {
        mode: "compaction",
        triggerRatio: 0.5,
        safetyMarginTokens: 0,
        outputReserveTokens: 100,
        summaryMaxTokens: 1_000,
        keepRecentTokens: 100,
        maxCompactionRetries: 1,
      },
      compactionContextKey: "session:test",
      compactionCheckpointStore: checkpointStore,
      contextWindowTokens: 10_000,
      outputReserveTokens: 100,
    } as any);

    await Promise.race([
      prepared,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("compaction prepareStep did not finish")), 2_000),
      ),
    ]);
    const completion = await Promise.race([
      result.completion,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("agent completion did not finish")), 2_000),
      ),
    ]);

    expect(completion.status).toBe("completed");
    expect(preparedContext.messages[0]).toMatchObject({ role: "user" });
    expect(preparedContext.messages[0].parts[0].text).toContain("<context-summary>");
    expect(checkpoint).toMatchObject({
      version: 1,
      coveredTranscriptCursor: 3,
      summary,
    });
    expect(completion.messages).not.toContainEqual(
      expect.objectContaining({
        parts: [{ type: "text", text: expect.stringContaining("<context-summary>") }],
      }),
    );
  });
});
