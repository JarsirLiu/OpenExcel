import { describe, expect, it } from "vitest";
import { createUIStreamAdapter } from "./uiStreamAdapter.js";

describe("createUIStreamAdapter", () => {
  it("keeps reasoning chunks in the UI stream", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue({ type: "reasoning-start", id: "reasoning-1" });
        controller.enqueue({
          type: "reasoning-delta",
          id: "reasoning-1",
          text: "先分析",
        });
        controller.enqueue({ type: "reasoning-end", id: "reasoning-1" });
        controller.close();
      },
    });

    const output = createUIStreamAdapter({
      stream,
      tools: {},
      originalMessages: [],
    });
    const reader = output.getReader();
    const chunks: unknown[] = [];
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      chunks.push(result.value);
    }

    expect(chunks).toContainEqual({
      type: "reasoning-start",
      id: "reasoning-1",
    });
    expect(chunks).toContainEqual({
      type: "reasoning-delta",
      id: "reasoning-1",
      delta: "先分析",
    });
  });
});
