import { describe, expect, it } from "vitest";
import { estimateTokens, trimMessagesToContextWindow } from "./contextWindow.js";

describe("trimMessagesToContextWindow", () => {
  it("keeps the latest contiguous messages within the input budget", () => {
    const messages = Array.from({ length: 12 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "assistant",
      content: `message-${index}-${"data ".repeat(20)}`,
    }));

    const result = trimMessagesToContextWindow(messages, {
      contextWindowTokens: 120,
      outputReserveTokens: 10,
    });

    expect(result.messages.at(-1)).toEqual(messages.at(-1));
    expect(result.droppedMessages).toBeGreaterThan(0);
    expect(result.estimatedTokens).toBeLessThanOrEqual(result.budgetTokens);
  });

  it("reserves space for the system prompt and model output", () => {
    const result = trimMessagesToContextWindow([{ role: "user", content: "问题" }], {
      contextWindowTokens: 100,
      outputReserveTokens: 20,
      systemPrompt: "系统提示 ".repeat(20),
    });

    expect(result.budgetTokens).toBe(100 - 20 - estimateTokens("系统提示 ".repeat(20)));
    expect(result.messages).toHaveLength(1);
  });

  it("truncates an oversized latest text message instead of dropping the request", () => {
    const result = trimMessagesToContextWindow(
      [{ role: "user", content: "很长的请求 ".repeat(1_000) }],
      { contextWindowTokens: 100, outputReserveTokens: 10 },
    );

    expect(result.messages).toHaveLength(1);
    expect(result.messages[0].content).toContain("内容已按上下文预算截断");
  });

  it("keeps complete recent turns instead of splitting tool messages", () => {
    const messages = [
      { role: "user", content: "第一轮" },
      { role: "assistant", parts: [{ type: "tool-readSheet", state: "output" }] },
      { role: "user", content: "第二轮" },
      { role: "assistant", parts: [{ type: "tool-readSheet", state: "output" }] },
      { role: "user", content: "第三轮" },
      { role: "assistant", content: "完成" },
    ];

    const result = trimMessagesToContextWindow(messages, {
      maxConversationTurns: 2,
      contextWindowTokens: 10_000,
      outputReserveTokens: 0,
    });

    expect(result.messages).toEqual(messages.slice(2));
    expect(result.conversationTurns).toBe(2);
    expect(result.droppedTurns).toBe(1);
  });

  it("caps each oversized user message before building model context", () => {
    const result = trimMessagesToContextWindow(
      [{ role: "user", content: "用户粘贴的数据 ".repeat(10_000) }],
      {
        contextWindowTokens: 10_000,
        outputReserveTokens: 0,
        maxUserInputTokens: 30,
      },
    );

    expect(estimateTokens(result.messages[0])).toBeLessThanOrEqual(30);
    expect(result.messages[0].content).toContain("内容已按上下文预算截断");
    expect(result.truncatedUserMessages).toBe(1);
  });
});
