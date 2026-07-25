import { describe, expect, it } from "vitest";
import {
  projectRunCheckpoint,
  projectStreamedAssistantMessages,
} from "./runCheckpointProjector.js";

describe("projectStreamedAssistantMessages", () => {
  it("groups text and reasoning deltas by message and part", () => {
    const messages = projectStreamedAssistantMessages([
      {
        eventId: "2",
        sequence: 2,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "second", partId: "second-text", delta: "B" },
      },
      {
        eventId: "1",
        sequence: 1,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-text", delta: "A" },
      },
      {
        eventId: "3",
        sequence: 3,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-text", delta: "1" },
      },
      {
        eventId: "4",
        sequence: 4,
        type: "reasoning.delta",
        occurredAt: "",
        payload: { messageId: "first", partId: "first-reasoning", delta: "why" },
      },
    ]);

    expect(messages).toEqual([
      {
        role: "assistant",
        parts: [
          { type: "text", text: "A1" },
          { type: "reasoning", text: "why" },
        ],
      },
      { role: "assistant", parts: [{ type: "text", text: "B" }] },
    ]);
  });
});

describe("projectRunCheckpoint", () => {
  it("keeps reasoning separate and preserves tool events by sequence", () => {
    const checkpoint = projectRunCheckpoint(
      [
        {
          eventId: "reasoning-1",
          sequence: 1,
          type: "reasoning.delta",
          occurredAt: "",
          payload: { delta: "think " },
        },
        {
          eventId: "tool-1",
          sequence: 2,
          type: "tool.started",
          occurredAt: "",
          payload: { toolCallId: "call-1", toolName: "createChart" },
        },
        {
          eventId: "message-1",
          sequence: 3,
          type: "message.delta",
          occurredAt: "",
          payload: { messageId: "message-1", partId: "message-1-text", delta: "done" },
        },
      ],
      [{ role: "assistant", parts: [{ type: "text", text: "done" }] }],
    );

    expect(checkpoint).toEqual({
      checkpointSequence: 3,
      transcript: [{ role: "assistant", parts: [{ type: "text", text: "done" }] }],
      reasoning: "think ",
      toolState: [
        { type: "tool.started", payload: { toolCallId: "call-1", toolName: "createChart" } },
      ],
    });
  });
});
