import { describe, expect, it } from "vitest";
import { withWorkspaceUndoLock } from "./workspaceUndoLock.js";

describe("withWorkspaceUndoLock", () => {
  it("serializes operations within one workspace", async () => {
    let releaseFirst!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let active = 0;
    let maximumActive = 0;
    const order: string[] = [];

    const first = withWorkspaceUndoLock(7, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await firstReady;
      order.push("first");
      active -= 1;
    });
    const second = withWorkspaceUndoLock(7, async () => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      order.push("second");
      active -= 1;
    });

    await Promise.resolve();
    expect(maximumActive).toBe(1);
    expect(order).toEqual([]);

    releaseFirst();
    await Promise.all([first, second]);

    expect(maximumActive).toBe(1);
    expect(order).toEqual(["first", "second"]);
  });

  it("does not serialize different workspaces", async () => {
    let releaseFirst!: () => void;
    const firstReady = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    let secondStarted = false;

    const first = withWorkspaceUndoLock(7, async () => firstReady);
    const second = withWorkspaceUndoLock(8, async () => {
      secondStarted = true;
    });

    await second;
    expect(secondStarted).toBe(true);

    releaseFirst();
    await first;
  });
});
