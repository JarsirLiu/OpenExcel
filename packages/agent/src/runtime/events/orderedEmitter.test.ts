import { describe, expect, it } from "vitest";
import { createOrderedAgentEventEmitter } from "./orderedEmitter.js";

describe("createOrderedAgentEventEmitter", () => {
  it("persists and publishes events in FIFO order", async () => {
    const order: string[] = [];
    const emitter = createOrderedAgentEventEmitter({
      persistenceBarrier: {
        persist: async (event) => {
          order.push(`persist:${event.sequence}`);
        },
      },
      eventSink: {
        publish: async (event) => {
          order.push(`publish:${event.sequence}`);
        },
      },
    });

    await Promise.all([emitter.emit("run.started"), emitter.emit("step.started")]);
    await emitter.flushAndClose();

    expect(order).toEqual(["persist:0", "publish:0", "persist:1", "publish:1"]);
  });

  it("stops accepting events after persistence failure", async () => {
    const abortController = new AbortController();
    const emitter = createOrderedAgentEventEmitter({
      abortController,
      persistenceBarrier: {
        persist: async () => {
          throw new Error("database unavailable");
        },
      },
    });

    await expect(emitter.emit("run.started")).rejects.toThrow("database unavailable");
    expect(abortController.signal.aborted).toBe(true);
    await expect(emitter.emit("step.started")).rejects.toThrow("database unavailable");
    await expect(emitter.flushAndClose()).rejects.toThrow("database unavailable");
  });
});
