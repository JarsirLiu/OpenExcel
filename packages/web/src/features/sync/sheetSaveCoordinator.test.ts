import { describe, expect, it, vi } from "vitest";
import { SheetSaveCoordinator } from "./sheetSaveCoordinator";

describe("SheetSaveCoordinator", () => {
  it("saves only the latest snapshot after debounce", async () => {
    vi.useFakeTimers();
    try {
      const coordinator = new SheetSaveCoordinator();
      coordinator.reset(60, { celldata: [], config: null }, 4);
      const save = vi.fn().mockResolvedValue({ revision: 5 });

      coordinator.schedule(
        60,
        { celldata: [{ r: 0, c: 0, v: { v: 1, m: "1" } }], config: null },
        save,
      );
      coordinator.schedule(
        60,
        { celldata: [{ r: 0, c: 0, v: { v: 2, m: "2" } }], config: null },
        save,
      );
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

      coordinator.schedule(
        60,
        { celldata: [{ r: 0, c: 0, v: { v: 1, m: "1" } }], config: null },
        save,
      );
      await vi.advanceTimersByTimeAsync(500);
      coordinator.schedule(
        60,
        { celldata: [{ r: 0, c: 0, v: { v: 2, m: "2" } }], config: null },
        save,
      );
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

  it("sends sparse cell patches across multiple chunks", async () => {
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
        {
          celldata: [
            { r: 0, c: 0, v: { v: 9, m: "9" } },
            { r: 0, c: 1, v: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
            { r: 300, c: 300, v: { v: 11, m: "11" } },
          ],
          config: null,
        },
        save,
        {
          mutation: {
            type: "patch",
            cells: [
              { row: 1, col: 1, cell: { v: 9, m: "9" } },
              { row: 1, col: 2, cell: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
              { row: 301, col: 301, cell: { v: 11, m: "11" } },
            ],
          },
        },
      );
      await vi.advanceTimersByTimeAsync(500);

      expect(save).toHaveBeenCalledOnce();
      expect(save.mock.calls[0]?.[0]).toEqual({
        kind: "mutation",
        baseRevision: 4,
        mutation: {
          type: "patch",
          cells: [
            { row: 1, col: 1, cell: { v: 9, m: "9" } },
            { row: 1, col: 2, cell: { v: 9, m: "9", f: "=SUM(A1:A1)" } },
            { row: 301, col: 301, cell: { v: 11, m: "11" } },
          ],
        },
      });
      coordinator.dispose();
    } finally {
      vi.useRealTimers();
    }
  });
});
