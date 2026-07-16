import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkbookMeta } from "@/api/workbooks";

const mocks = vi.hoisted(() => ({
  fetchWorkbooks: vi.fn(),
  importWorkbookFile: vi.fn(),
  importWorkbooks: vi.fn(),
  toast: vi.fn(),
  setWorkbooks: vi.fn(),
  replaceCurrentWorkbook: vi.fn(),
  setWorkbookIdx: vi.fn(),
}));

vi.mock("@/api/workbooks", () => ({
  fetchWorkbooks: mocks.fetchWorkbooks,
  importWorkbooks: mocks.importWorkbooks,
}));

vi.mock("@/features/workbook/import/workbookImporter", () => ({
  importWorkbookFile: mocks.importWorkbookFile,
}));

vi.mock("@/features/workspace/useWorkbookCatalog", () => ({
  useWorkbookCatalog: () => ({
    workbooks: [],
    workbookIdx: 0,
    currentWorkbook: null,
    workbookRevision: 0,
    loading: false,
    setWorkbooks: mocks.setWorkbooks,
    replaceCurrentWorkbook: mocks.replaceCurrentWorkbook,
    setWorkbookIdx: mocks.setWorkbookIdx,
    switchWorkbook: vi.fn(),
  }),
}));

vi.mock("@/shared/lib", () => ({ toast: mocks.toast }));

import { useWorkspaceView } from "./useWorkspaceView";

const workbook = (id: number): WorkbookMeta => ({
  id,
  publicId: `workbook-${id}`,
  name: `Workbook ${id}`,
  order: 0,
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((nextResolve) => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

describe("useWorkspaceView", () => {
  beforeEach(() => {
    mocks.fetchWorkbooks.mockReset();
    mocks.importWorkbookFile.mockReset();
    mocks.importWorkbooks.mockReset();
    mocks.toast.mockReset();
    mocks.setWorkbooks.mockReset();
    mocks.replaceCurrentWorkbook.mockReset();
    mocks.setWorkbookIdx.mockReset();
  });

  it("reports a persisted import when the final catalog request is superseded", async () => {
    const importedCatalog = deferred<WorkbookMeta[]>();
    const replacementCatalog = deferred<WorkbookMeta[]>();
    mocks.fetchWorkbooks
      .mockReturnValueOnce(importedCatalog.promise)
      .mockReturnValueOnce(replacementCatalog.promise);
    mocks.importWorkbookFile.mockResolvedValue({});
    mocks.importWorkbooks.mockResolvedValue([
      { id: 7, publicId: "workbook-7", name: "Imported", sheets: 1 },
    ]);

    const { result } = renderHook(() => useWorkspaceView(1));
    let importPromise: Promise<boolean> | undefined;

    act(() => {
      importPromise = result.current.handleNewWorkbookFileChange([
        new File(["data"], "import.xlsx"),
      ]);
    });
    await waitFor(() => expect(mocks.fetchWorkbooks).toHaveBeenCalledTimes(1));

    let replacementPromise: Promise<void> | undefined;
    act(() => {
      replacementPromise = result.current.handleWorkspaceRefresh();
    });
    await act(async () => {
      replacementCatalog.resolve([]);
      await replacementPromise;
      importedCatalog.resolve([workbook(7)]);
      await importPromise;
    });

    await expect(importPromise).resolves.toBe(true);
  });
});
