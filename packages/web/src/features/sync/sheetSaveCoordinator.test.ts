import type { FortuneCell } from "@openexcel/core";
import { describe, expect, it, vi } from "vitest";
import { SheetSaveCoordinator } from "./sheetSaveCoordinator";

type PatchCell = { row: number; col: number; cell: Record<string, unknown> | null };

const snapshot = (celldata: FortuneCell[]) => ({
  kind: "snapshot" as const,
  snapshot: { celldata, config: null },
});
const patch = (cells: PatchCell[]) => ({
  kind: "patch" as const,
  mutation: { type: "patch" as const, cells },
});

describe("SheetSaveCoordinator", () => {
  it("saves only the latest snapshot after debounce", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(60, { celldata: [], config: null }, 4);
      const save = vi.fn().mockResolvedValue({ revision: 5 });
      coordinator.schedule(60, snapshot([{ r: 0, c: 0, v: { v: 1, m: "1" } }]), save);
      coordinator.schedule(60, snapshot([{ r: 0, c: 0, v: { v: 2, m: "2" } }]), save);
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        baseRevision: 4,
        chunks: [{ chunkRow: 0, chunkCol: 0 }],
      });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("uses the returned revision for edits made while a save is in flight", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(60, { celldata: [], config: null }, 4);
      let resolveFirst: ((value: { revision: number }) => void) | undefined;
      const firstResult = new Promise<{ revision: number }>((resolve) => {
        resolveFirst = resolve;
      });
      const save = vi.fn().mockReturnValueOnce(firstResult).mockResolvedValueOnce({ revision: 6 });
      coordinator.schedule(60, snapshot([{ r: 0, c: 0, v: { v: 1, m: "1" } }]), save);
      await vi.advanceTimersByTimeAsync(500);
      coordinator.schedule(60, snapshot([{ r: 0, c: 0, v: { v: 2, m: "2" } }]), save);
      resolveFirst?.({ revision: 5 });
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 5 });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("sends sparse patches and formula caches without materializing the sheet", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(60, { celldata: [{ r: 0, c: 0, v: { v: 90, m: "90" } }], config: null }, 4);
      const save = vi.fn().mockResolvedValue({ revision: 5 });
      coordinator.schedule(
        60,
        patch([
          { row: 1, col: 1, cell: { v: 9, m: "9" } },
          { row: 1, col: 2, cell: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
        ]),
        save,
      );
      await vi.advanceTimersByTimeAsync(500);
      expect(save).toHaveBeenCalledWith({
        kind: "mutation",
        baseRevision: 4,
        mutation: {
          type: "patch",
          cells: [
            { row: 1, col: 1, cell: { v: 9, m: "9" } },
            { row: 1, col: 2, cell: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
          ],
        },
      });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps patch transport sparse across multiple chunks", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(
        60,
        {
          celldata: [
            { r: 0, c: 0, v: { v: 90, m: "90" } },
            { r: 300, c: 300, v: { v: 10, m: "10" } },
          ],
          config: null,
        },
        4,
      );
      const save = vi.fn().mockResolvedValue({ revision: 5 });
      coordinator.schedule(
        60,
        patch([
          { row: 1, col: 1, cell: { v: 9, m: "9" } },
          { row: 301, col: 301, cell: { v: 11, m: "11" } },
        ]),
        save,
      );
      await vi.advanceTimersByTimeAsync(500);
      expect(save.mock.calls[0]?.[0]).toMatchObject({
        kind: "mutation",
        mutation: {
          type: "patch",
          cells: [
            { row: 1, col: 1 },
            { row: 301, col: 301 },
          ],
        },
      });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });

  it("rebases local cells without overwriting untouched remote cells", () => {
    const coordinator = new SheetSaveCoordinator();
    coordinator.reset(
      60,
      {
        celldata: [
          { r: 0, c: 0, v: { v: 1, m: "1" } },
          { r: 0, c: 1, v: { v: 2, m: "2" } },
        ],
        config: null,
      },
      4,
    );
    coordinator.schedule(60, patch([{ row: 1, col: 1, cell: { v: 9, m: "9" } }]), vi.fn());
    const rebased = coordinator.rebase(
      60,
      {
        celldata: [
          { r: 0, c: 0, v: { v: 1, m: "1" } },
          { r: 0, c: 1, v: { v: 8, m: "8" } },
        ],
        config: null,
      },
      5,
    );
    expect(rebased?.celldata).toEqual([
      { r: 0, c: 0, v: { v: 9, m: "9" } },
      { r: 0, c: 1, v: { v: 8, m: "8" } },
    ]);
    coordinator.dispose();
  });

  it("retries a failed save without requiring another edit", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(60, { celldata: [], config: null }, 4);
      const save = vi
        .fn()
        .mockRejectedValueOnce(new Error("network failure"))
        .mockResolvedValueOnce({ revision: 5 });
      coordinator.schedule(60, patch([{ row: 1, col: 1, cell: { v: 1, m: "1" } }]), save);
      await vi.advanceTimersByTimeAsync(500);
      await vi.advanceTimersByTimeAsync(1000);
      expect(save).toHaveBeenCalledTimes(2);
      expect(save.mock.calls[1]?.[0]).toMatchObject({ baseRevision: 4 });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
