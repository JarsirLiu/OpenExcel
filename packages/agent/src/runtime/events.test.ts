import { describe, expect, it, vi } from "vitest";
import { createAgentEventEmitter } from "./events.js";

describe("createAgentEventEmitter", () => {
  it("persists an event before publishing it", async () => {
    const order: string[] = [];
    const event = createAgentEventEmitter({
      persistenceBarrier: {
        persist: async (value) => {
          order.push(`persist:${value.sequence}`);
        },
      },
      eventSink: {
        publish: async (value) => {
          order.push(`publish:${value.sequence}`);
        },
      },
    });

    const first = await event.emit("run.started", { requestId: "req-1" });
    const second = await event.emit("step.finished");

    expect(order).toEqual(["persist:0", "publish:0", "persist:1", "publish:1"]);
    expect(first).toMatchObject({ sequence: 0, type: "run.started" });
    expect(second).toMatchObject({ sequence: 1, type: "step.finished" });
  });

  it("does not publish when persistence rejects", async () => {
    const publish = vi.fn();
    const event = createAgentEventEmitter({
      persistenceBarrier: {
        persist: async () => {
          throw new Error("durability failed");
        },
      },
      eventSink: { publish },
    });

    await expect(event.emit("tool.started")).rejects.toThrow("durability failed");
    expect(publish).not.toHaveBeenCalled();
  });
});
