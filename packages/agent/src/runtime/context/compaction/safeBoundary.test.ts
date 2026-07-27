import { describe, expect, it } from "vitest";
import { selectSafeContextTail } from "./safeBoundary.js";
import { ContextCompactionError } from "./types.js";

const estimator = { estimate: (value: unknown) => JSON.stringify(value).length };

describe("selectSafeContextTail", () => {
  it("keeps complete turns and their tool messages together", () => {
    const messages = [
      { role: "user", content: "old request" },
      { role: "assistant", parts: [{ type: "tool-call", toolCallId: "1" }] },
      { role: "tool", content: "old result", toolCallId: "1" },
      { role: "user", content: "recent request" },
      { role: "assistant", parts: [{ type: "tool-call", toolCallId: "2" }] },
      { role: "tool", content: "recent result", toolCallId: "2" },
    ];

    const transcript = messages.map((message, cursor) => ({ cursor, message }));
    const result = selectSafeContextTail(transcript, {
      keepRecentTokens: estimator.estimate(messages.slice(3)),
      estimator,
    });

    expect(result.recentMessages).toEqual(messages.slice(3));
    expect(result.compactedMessages).toEqual(messages.slice(0, 3));
    expect(result.recentEntries.map((entry) => entry.cursor)).toEqual([3, 4, 5]);
    expect(result.recentStartIndex).toBe(3);
  });

  it("fails instead of splitting an oversized latest turn", () => {
    const error = (() => {
      try {
        selectSafeContextTail(
          [
            { role: "user", content: "request" },
            { role: "assistant", content: "result" },
          ].map((message, cursor) => ({ cursor, message })),
          { keepRecentTokens: 1, estimator },
        );
      } catch (value) {
        return value;
      }
      return undefined;
    })();

    expect(error).toBeInstanceOf(ContextCompactionError);
    expect((error as ContextCompactionError).stage).toBe("boundary");
  });
});
