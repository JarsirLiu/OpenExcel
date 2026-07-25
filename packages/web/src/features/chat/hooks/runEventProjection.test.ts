import { describe, expect, it } from "vitest";
import { applyRunEventsToMessages } from "./runEventProjection";

describe("applyRunEventsToMessages", () => {
  it("projects text and reasoning deltas into one replayable assistant message", () => {
    const first = applyRunEventsToMessages([], 7, [
      {
        eventId: "1",
        sequence: 1,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "m1", partId: "p1", delta: "Hi" },
      },
      {
        eventId: "2",
        sequence: 2,
        type: "reasoning.delta",
        occurredAt: "",
        payload: { messageId: "m1", partId: "r1", delta: "why" },
      },
    ]);
    const second = applyRunEventsToMessages(first, 7, [
      {
        eventId: "3",
        sequence: 3,
        type: "message.delta",
        occurredAt: "",
        payload: { messageId: "m1", partId: "p1", delta: "!" },
      },
    ]);

    expect(second).toEqual([
      {
        id: "run-7-m1",
        role: "assistant",
        parts: [
          { id: "p1", type: "text", text: "Hi!" },
          { id: "r1", type: "reasoning", text: "why" },
        ],
        __runLastSequence: 3,
      },
    ]);
  });

  it("keeps multiple assistant messages separate and ignores replayed sequences", () => {
    const events = [
      {
        eventId: "1",
        sequence: 1,
        type: "message.delta" as const,
        occurredAt: "",
        payload: { messageId: "m1", partId: "p1", delta: "A" },
      },
      {
        eventId: "2",
        sequence: 2,
        type: "message.delta" as const,
        occurredAt: "",
        payload: { messageId: "m2", partId: "p2", delta: "B" },
      },
    ];
    const first = applyRunEventsToMessages([], 7, events);
    const second = applyRunEventsToMessages(first, 7, events);

    expect(second).toEqual(first);
    expect(second.map((message) => message.parts)).toEqual([
      [{ id: "p1", type: "text", text: "A" }],
      [{ id: "p2", type: "text", text: "B" }],
    ]);
  });

  it("ignores non-delta events and preserves existing messages", () => {
    const messages = [{ id: "user-1", role: "user", parts: [{ type: "text", text: "hello" }] }];
    expect(
      applyRunEventsToMessages(messages, 4, [
        { eventId: "1", sequence: 1, type: "run.started", occurredAt: "", payload: {} },
      ]),
    ).toEqual(messages);
  });
});
