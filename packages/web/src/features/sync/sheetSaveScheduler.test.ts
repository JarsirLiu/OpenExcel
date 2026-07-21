import { afterEach, describe, expect, it, vi } from "vitest";
import { SheetSaveScheduler } from "./sheetSaveScheduler";

describe("SheetSaveScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("debounces independent Sheets without cancelling either save", async () => {
    vi.useFakeTimers();
    const scheduler = new SheetSaveScheduler(undefined, 500);
    const calls: number[] = [];

    scheduler.schedule(1, 0, async () => {
      calls.push(1);
      return { revision: 1 };
    });
    scheduler.schedule(2, 4, async () => {
      calls.push(2);
      return { revision: 5 };
    });

    await vi.advanceTimersByTimeAsync(500);

    expect(calls).toEqual([1, 2]);
    scheduler.dispose();
  });

  it("allows a new save after an external revision invalidates queued work", async () => {
    vi.useFakeTimers();
    const scheduler = new SheetSaveScheduler(undefined, 0);
    const calls: number[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    scheduler.schedule(1, 0, async (revision) => {
      calls.push(revision);
      await first;
      return { revision: 1 };
    });
    await vi.advanceTimersByTimeAsync(0);
    scheduler.schedule(1, 0, async (revision) => {
      calls.push(revision);
      return { revision: 2 };
    });
    scheduler.setRevision(1, 1);
    scheduler.schedule(1, 1, async (revision) => {
      calls.push(revision);
      return { revision: 2 };
    });

    releaseFirst();
    await vi.advanceTimersByTimeAsync(0);

    expect(calls).toEqual([0, 1]);
    scheduler.dispose();
  });
});
