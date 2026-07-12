import { describe, expect, it } from "vitest";
import { withSessionLock } from "./concurrency.js";

describe("withSessionLock", () => {
  it("serializes operations for the same session", async () => {
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withSessionLock(1, async () => {
      events.push("first-start");
      await firstReady;
      events.push("first-end");
    });
    const second = withSessionLock(1, async () => {
      events.push("second");
    });

    await Promise.resolve();
    expect(events).toEqual(["first-start"]);
    releaseFirst();
    await Promise.all([first, second]);

    expect(events).toEqual(["first-start", "first-end", "second"]);
  });

  it("allows different sessions to proceed independently", async () => {
    const events: number[] = [];
    let releaseFirst!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const first = withSessionLock(1, async () => {
      await firstReady;
      events.push(1);
    });
    const second = withSessionLock(2, async () => {
      events.push(2);
    });

    await second;
    expect(events).toEqual([2]);
    releaseFirst();
    await first;
  });
});
