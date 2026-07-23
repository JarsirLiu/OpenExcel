import { describe, expect, it } from "vitest";
import { applyInitialMessages, prepareChatTurn } from "./useChatConversation";

describe("applyInitialMessages", () => {
  it("preserves messages sent while the initial history request is pending", () => {
    const userMessage = { id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] };

    expect(applyInitialMessages([userMessage], [])).toEqual([userMessage]);
  });

  it("loads history when no local message exists", () => {
    const history = [{ id: "assistant-1", role: "assistant", parts: [] }];

    expect(applyInitialMessages([], history)).toEqual(history);
  });

  it("sends only the latest user turn instead of local conversation history", () => {
    const oldAssistant = { id: "old", role: "assistant", parts: [] };
    const userMessage = {
      id: "message-1",
      role: "user",
      parts: [{ type: "text", text: "读取数据" }],
    };

    expect(prepareChatTurn([oldAssistant, userMessage], "submit-message")).toEqual({
      requestId: "message-1",
      message: {
        messageId: "message-1",
        role: "user",
        parts: [{ type: "text", text: "读取数据" }],
      },
    });
  });

  it("rejects regeneration and unsupported client parts", () => {
    expect(() => prepareChatTurn([], "regenerate-message")).toThrow();
    expect(() =>
      prepareChatTurn(
        [{ id: "message-1", role: "user", parts: [{ type: "tool-call" }] }],
        "submit-message",
      ),
    ).toThrow();
  });
});
