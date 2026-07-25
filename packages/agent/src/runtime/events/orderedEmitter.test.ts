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

  it("flushes events already queued before closing", async () => {
    const persisted: number[] = [];
    let releaseFirst: (() => void) | undefined;
    const firstPersistence = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const emitter = createOrderedAgentEventEmitter({
      persistenceBarrier: {
        persist: async (event) => {
          if (event.sequence === 0) await firstPersistence;
          persisted.push(event.sequence);
        },
      },
    });

    const first = emitter.emit("run.started");
    const second = emitter.emit("message.delta", { delta: "partial" });
    const flushed = emitter.flushAndClose();
    await Promise.resolve();
    expect(persisted).toEqual([]);

    releaseFirst?.();
    await Promise.all([first, second, flushed]);
    expect(persisted).toEqual([0, 1]);
    await expect(emitter.emit("step.started")).rejects.toThrow("closed");
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
