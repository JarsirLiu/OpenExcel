import { describe, expect, it } from "vitest";
import { applyInitialMessages } from "./useChatConversation";

describe("applyInitialMessages", () => {
  it("preserves messages sent while the initial history request is pending", () => {
    const userMessage = { id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] };

    expect(applyInitialMessages([userMessage], [])).toEqual([userMessage]);
  });

  it("loads history when no local message exists", () => {
    const history = [{ id: "assistant-1", role: "assistant", parts: [] }];

    expect(applyInitialMessages([], history)).toEqual(history);
  });
});
