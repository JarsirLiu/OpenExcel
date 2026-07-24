import { describe, expect, it } from "vitest";
import { removeEmptyAssistantMessages } from "./transcript.js";

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
