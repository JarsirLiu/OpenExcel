import { describe, expect, it, vi } from "vitest";
import { openChatEventStream } from "./chatEventStream";

describe("openChatEventStream", () => {
  it("parses newline-delimited events and exposes the run id", async () => {
    const onRunId = vi.fn();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(
          '{"eventId":"event-1","sequence":0,"type":"message.delta","occurredAt":"2026-07-26T00:00:00.000Z","payload":{"delta":"好"}}\n',
          { headers: { "X-OpenExcel-Run-Id": "9" } },
        ),
      );

    try {
      const events = [];
      for await (const event of openChatEventStream({
        api: "/chat",
        body: {},
        signal: new AbortController().signal,
        onRunId,
      })) {
        events.push(event);
      }

      expect(onRunId).toHaveBeenCalledWith(9);
      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("message.delta");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
