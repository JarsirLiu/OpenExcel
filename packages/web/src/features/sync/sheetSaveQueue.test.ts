import { describe, expect, it, vi } from "vitest";
import { SheetSaveInvalidatedError, SheetSaveQueue } from "./sheetSaveQueue";

describe("SheetSaveQueue", () => {
  it("serializes saves and advances the base revision", async () => {
    const queue = new SheetSaveQueue();
    const calls: number[] = [];
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });

    const task = vi
      .fn<(...args: [number]) => Promise<{ revision: number }>>()
      .mockImplementationOnce(async (baseRevision) => {
        calls.push(baseRevision);
        await first;
        return { revision: 1 };
      })
      .mockImplementationOnce(async (baseRevision) => {
        calls.push(baseRevision);
        return { revision: 2 };
      });

    const firstSave = queue.enqueue(7, 0, task);
    const secondSave = queue.enqueue(7, 0, task);

    await Promise.resolve();
    expect(calls).toEqual([0]);
    releaseFirst();

    await Promise.all([firstSave, secondSave]);
    expect(calls).toEqual([0, 1]);
  });

  it("does not block a different Sheet", async () => {
    const queue = new SheetSaveQueue();
    const calls: number[] = [];

    await Promise.all([
      queue.enqueue(1, 0, async (revision) => {
        calls.push(revision);
        return { revision: 1 };
      }),
      queue.enqueue(2, 4, async (revision) => {
        calls.push(revision);
        return { revision: 5 };
      }),
    ]);

    expect(calls).toEqual([0, 4]);
  });

  it("drops queued saves when an external revision arrives", async () => {
    const queue = new SheetSaveQueue();
    queue.setRevision(3, 0);
    let releaseFirst!: () => void;
    const first = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const task = vi.fn(async (baseRevision: number) => {
      await first;
      return { revision: baseRevision + 1 };
    });

    const firstSave = queue.enqueue(3, 0, task);
    const secondSave = queue.enqueue(3, 0, task);
    await Promise.resolve();
    queue.setRevision(3, 1);
    releaseFirst();

    await firstSave;
    await expect(secondSave).rejects.toBeInstanceOf(SheetSaveInvalidatedError);
    expect(task).toHaveBeenCalledTimes(1);
  });

  it("invalidates a save that is still waiting for debounce", () => {
    const queue = new SheetSaveQueue();
    const token = queue.registerPendingSave(3, 0);

    queue.setRevision(3, 1);

    expect(queue.consumePendingSave(3, token)).toBe(false);
  });
});
