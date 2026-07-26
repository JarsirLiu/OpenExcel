import { describe, expect, it } from "vitest";
import { createAgentEventStream } from "./agentEventStream.js";

describe("createAgentEventStream", () => {
  it("buffers confirmed events until the subscriber reads them", async () => {
    const eventStream = createAgentEventStream();
    const event = {
      eventId: "event-1",
      sequence: 0,
      type: "message.delta" as const,
      occurredAt: "2026-07-26T00:00:00.000Z",
      payload: { delta: "你好" },
    };

    await eventStream.sink.publish(event);
    eventStream.close();

    const reader = eventStream.stream.getReader();
    await expect(reader.read()).resolves.toEqual({ value: event, done: false });
    await expect(reader.read()).resolves.toEqual({ value: undefined, done: true });
  });
});
