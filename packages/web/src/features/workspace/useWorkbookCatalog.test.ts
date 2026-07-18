import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookFull, WorkbookMeta } from "@/api/workbooks";

const { fetchWorkbook, fetchWorkbooks } = vi.hoisted(() => ({
  fetchWorkbook: vi.fn(),
  fetchWorkbooks: vi.fn(),
}));

vi.mock("@/api/workbooks", () => ({ fetchWorkbook, fetchWorkbooks }));

import { useWorkbookCatalog } from "./useWorkbookCatalog";

const workbookMeta = (id: number): WorkbookMeta => ({
  id,
  publicId: `wb_${id}`,
  name: `Workbook ${id}`,
  order: 0,
});

const workbookFull = (id: number): WorkbookFull => ({
  ...workbookMeta(id),
  sheets: [],
  charts: [],
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkbookCatalog", () => {
  beforeEach(() => {
    sessionStorage.clear();
    fetchWorkbook.mockReset();
    fetchWorkbooks.mockReset();
  });

  it("keeps a hydrated workbook ready when route data is refreshed", async () => {
    const initial = {
      workspaceId: 1,
      workbooks: [workbookMeta(10)],
      currentWorkbook: workbookFull(10),
    };
    const { result, rerender } = renderHook(({ seed }) => useWorkbookCatalog(1, seed), {
      initialProps: { seed: initial },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    rerender({
      seed: {
        ...initial,
        workbooks: [{ ...initial.workbooks[0], name: "Refreshed workbook" }],
      },
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentWorkbook?.id).toBe(10);
    expect(fetchWorkbooks).not.toHaveBeenCalled();
    expect(fetchWorkbook).not.toHaveBeenCalled();
  });

  it("discards a late catalog response from the previous workspace", async () => {
    const firstCatalog = deferred<WorkbookMeta[]>();
    const secondCatalog = deferred<WorkbookMeta[]>();
    fetchWorkbooks.mockImplementation((workspaceId: number) =>
      workspaceId === 1 ? firstCatalog.promise : secondCatalog.promise,
    );
    fetchWorkbook.mockImplementation((workspaceId: number, workbookId: number) =>
      Promise.resolve(workbookFull(workspaceId * 10 + workbookId)),
    );

    const { result, rerender } = renderHook(({ workspaceId }) => useWorkbookCatalog(workspaceId), {
      initialProps: { workspaceId: 1 },
    });

    rerender({ workspaceId: 2 });
    await act(async () => {
      firstCatalog.resolve([workbookMeta(11)]);
      secondCatalog.resolve([workbookMeta(21)]);
    });

    await waitFor(() => expect(result.current.currentWorkbook?.id).toBe(41));
    expect(result.current.workbooks.map((workbook) => workbook.id)).toEqual([21]);
  });
});
