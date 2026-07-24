import { describe, expect, it } from "vitest";
import { appendResponseMessages, removeEmptyAssistantMessages } from "./transcript.js";

describe("removeEmptyAssistantMessages", () => {
  it("removes an empty assistant placeholder left by a failed stream", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "你好" }] },
      { role: "assistant", parts: [] },
      { role: "user", parts: [{ type: "text", text: "你是谁" }] },
    ];

    expect(removeEmptyAssistantMessages(messages)).toEqual([messages[0], messages[2]]);
  });

  it("keeps assistant messages that contain content", () => {
    const message = { role: "assistant", parts: [{ type: "text", text: "我是 AI" }] };

    expect(removeEmptyAssistantMessages([message])).toEqual([message]);
  });
});

describe("appendResponseMessages", () => {
  it("generates unique assistant IDs for each user turn", () => {
    const firstTurn = [{ id: "user-1", role: "user", parts: [] }];
    const secondTurn = [
      ...firstTurn,
      { id: "assistant-user-1-1", role: "assistant", parts: [{ type: "text", text: "第一轮" }] },
      { id: "user-2", role: "user", parts: [] },
    ];

    const first = appendResponseMessages(firstTurn, [
      { role: "assistant", content: [{ type: "text", text: "第一轮" }] },
    ]);
    const second = appendResponseMessages(secondTurn, [
      { role: "assistant", content: [{ type: "text", text: "第二轮" }] },
    ]);

    expect(first.at(-1)?.id).toBe("assistant-user-1-1");
    expect(second.at(-1)?.id).toBe("assistant-user-2-1");
  });
});
