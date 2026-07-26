import { describe, expect, it } from "vitest";
import { holdStreamOpenUntil } from "./settledStream.js";

describe("holdStreamOpenUntil", () => {
  it("waits for settlement before closing the stream", async () => {
    let resolveSettlement!: () => void;
    const settlement = new Promise<void>((resolve) => {
      resolveSettlement = resolve;
    });
    const stream = holdStreamOpenUntil(
      new ReadableStream({
        start(controller) {
          controller.enqueue("chunk");
          controller.close();
        },
      }),
      settlement,
    );
    const reader = stream.getReader();

    await expect(reader.read()).resolves.toEqual({ value: "chunk", done: false });

    const closing = reader.read();
    let closed = false;
    void closing.then(() => {
      closed = true;
    });
    await Promise.resolve();
    expect(closed).toBe(false);

    resolveSettlement();
    await expect(closing).resolves.toEqual({ value: undefined, done: true });
  });
});
