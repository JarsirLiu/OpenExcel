import { describe, expect, it } from "vitest";
import { projectStreamedAssistantMessages } from "./runCheckpointProjector.js";

describe("projectStreamedAssistantMessages", () => {
  it("groups deltas by message and preserves first-seen order", () => {
    const messages = projectStreamedAssistantMessages([
      {
        eventId: "2",
        sequence: 2,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "second", delta: "B" },
      },
      {
        eventId: "1",
        sequence: 1,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", delta: "A" },
      },
      {
        eventId: "3",
        sequence: 3,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", delta: "1" },
      },
    ]);

    expect(messages).toEqual([
      { role: "assistant", parts: [{ type: "text", text: "A1" }] },
      { role: "assistant", parts: [{ type: "text", text: "B" }] },
    ]);
  });
});
