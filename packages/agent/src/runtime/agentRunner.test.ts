import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ runAgentLoop: vi.fn() }));

vi.mock("./agentLoop.js", () => ({ runAgentLoop: mocks.runAgentLoop }));

import { createAgentRunner } from "./agentRunner.js";

describe("AgentRunner", () => {
  beforeEach(() => {
    mocks.runAgentLoop.mockReset();
  });

  it("assembles model context inside the agent package", async () => {
    const result = { stream: new ReadableStream(), completion: Promise.resolve({}) };
    mocks.runAgentLoop.mockResolvedValue(result);

    const transcript = [{ id: "message-1", role: "user", parts: [{ type: "text", text: "你好" }] }];
    const tools = {};
    const runner = createAgentRunner({
      modelConfig: { modelName: "test-model" } as never,
      transcript,
      workspace: [{ id: 1, name: "预算", sheets: [{ id: 2, name: "Sheet1", sheetNo: 1 }] }],
      tools: [{ name: "readSheetData", description: "读取", inputSchema: {} as never }],
      toolExecutor: { execute: vi.fn() },
    });

    await expect(runner.run()).resolves.toBe(result);
    expect(mocks.runAgentLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript,
        systemPrompt: expect.stringContaining("预算"),
        tools: expect.any(Array),
      }),
    );
  });
});
