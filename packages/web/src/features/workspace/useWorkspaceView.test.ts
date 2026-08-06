import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SheetSchema, WorkbookFull } from "@/api/workbooks";

const mocks = vi.hoisted(() => ({
  fetchSheet: vi.fn(),
  toast: vi.fn(),
  replaceCurrentWorkbook: vi.fn(),
  reloadCurrentWorkbook: vi.fn(),
  loadWorkbook: vi.fn(),
  loadSheet: vi.fn(),
  refreshCatalog: vi.fn(),
  createWorkbookInCatalog: vi.fn(),
  deleteWorkbookInCatalog: vi.fn(),
  importWorkbooksInCatalog: vi.fn(),
  renameWorkbookInCatalog: vi.fn(),
  requestWorkbookById: vi.fn(),
  commitWorkbook: vi.fn(),
  failWorkbookTransition: vi.fn(),
  clearActiveWorkbook: vi.fn(),
  bumpSession: vi.fn(),
  transition: null as { targetWorkbookId: number; status: "loading" | "failed" } | null,
}));

vi.mock("@/api/workbooks", () => ({
  fetchSheet: mocks.fetchSheet,
}));

let currentWorkbook: WorkbookFull | null = null;

vi.mock("@/features/workspace/useWorkbookCatalog", () => ({
  useWorkbookCatalog: () => ({
    workbooks: [],
    workbookIdx: 0,
    currentWorkbook,
    loading: false,
    replaceCurrentWorkbook: mocks.replaceCurrentWorkbook,
    reloadCurrentWorkbook: mocks.reloadCurrentWorkbook,
    loadWorkbook: mocks.loadWorkbook,
    loadSheet: mocks.loadSheet,
    refreshCatalog: mocks.refreshCatalog,
    createWorkbookInCatalog: mocks.createWorkbookInCatalog,
    deleteWorkbookInCatalog: mocks.deleteWorkbookInCatalog,
    importWorkbooksInCatalog: mocks.importWorkbooksInCatalog,
    renameWorkbookInCatalog: mocks.renameWorkbookInCatalog,
    requestWorkbookById: mocks.requestWorkbookById,
    commitWorkbook: mocks.commitWorkbook,
    failWorkbookTransition: mocks.failWorkbookTransition,
    clearActiveWorkbook: mocks.clearActiveWorkbook,
    activeWorkbookId: 1,
    transition: mocks.transition,
    retryTransition: vi.fn(),
    switchWorkbook: vi.fn(),
  }),
}));

vi.mock("./useWorkbookDocument", () => ({
  useWorkbookDocument: () => ({
    currentWorkbook,
    currentWorkbookRef: { current: currentWorkbook },
    replaceCurrentWorkbook: mocks.replaceCurrentWorkbook,
    updateCharts: vi.fn(),
    updateSheetRevision: vi.fn(),
    updateWorkbookMetadata: vi.fn(),
    loadWorkbook: mocks.loadWorkbook,
    reloadCurrentWorkbook: mocks.reloadCurrentWorkbook,
    loadSheet: async (sheetId: number) => {
      const loaded = await mocks.fetchSheet(1, sheetId, { signal: new AbortController().signal });
      if (currentWorkbook) {
        currentWorkbook = {
          ...currentWorkbook,
          sheets: currentWorkbook.sheets.map((sheet) => (sheet.id === loaded.id ? loaded : sheet)),
        };
        mocks.replaceCurrentWorkbook(currentWorkbook);
      }
      return currentWorkbook;
    },
    documentStore: null,
  }),
}));

vi.mock("./useWorkbookSession", () => ({
  useWorkbookSession: () => ({
    sessionRevision: 0,
    bumpSession: mocks.bumpSession,
  }),
}));

vi.mock("@/shared/lib", () => ({ toast: mocks.toast }));

import { useWorkspaceView } from "./useWorkspaceView";

describe("useWorkspaceView", () => {
  beforeEach(() => {
    currentWorkbook = null;
    mocks.fetchSheet.mockReset();
    mocks.toast.mockReset();
    mocks.replaceCurrentWorkbook.mockReset();
    mocks.bumpSession.mockReset();
    mocks.loadWorkbook.mockReset();
    mocks.reloadCurrentWorkbook.mockReset();
    mocks.commitWorkbook.mockReset();
    mocks.transition = null;
  });

  it("loads the new active sheet when its index stays the same", async () => {
    const initialSheet: SheetSchema = {
      id: 1,
      sheetNo: 0,
      name: "First",
      order: 0,
      columns: [],
      merges: [],
      uploadedData: [],
      config: null,
      revision: 1,
      loaded: true,
    };
    const replacementSheet: SheetSchema = {
      ...initialSheet,
      id: 2,
      name: "Replacement",
      loaded: false,
    };
    currentWorkbook = {
      id: 1,
      publicId: "workbook-1",
      name: "Workbook 1",
      sheets: [initialSheet],
      charts: [],
    };
    mocks.fetchSheet.mockResolvedValue({ ...replacementSheet, loaded: true });

    const { rerender } = renderHook(() => useWorkspaceView(1));
    currentWorkbook = { ...currentWorkbook, sheets: [replacementSheet] };
    rerender();

    await waitFor(() => expect(mocks.fetchSheet).toHaveBeenCalledWith(1, 2, expect.anything()));
  });

  it("completes the workbook transition after the document is replaced", async () => {
    currentWorkbook = {
      id: 1,
      publicId: "workbook-1",
      name: "Workbook 1",
      sheets: [],
      charts: [],
    };
    const loadedWorkbook: WorkbookFull = {
      id: 2,
      publicId: "workbook-2",
      name: "Workbook 2",
      sheets: [],
      charts: [],
    };
    mocks.transition = { targetWorkbookId: 2, status: "loading" };

    let resolveLoad!: (workbook: WorkbookFull) => void;
    mocks.loadWorkbook.mockReturnValue(
      new Promise<WorkbookFull>((resolve) => {
        resolveLoad = resolve;
      }),
    );

    const { rerender } = renderHook(() => useWorkspaceView(1));
    await waitFor(() => expect(mocks.loadWorkbook).toHaveBeenCalledWith(2, expect.anything()));

    currentWorkbook = loadedWorkbook;
    rerender();

    await waitFor(() => expect(mocks.commitWorkbook).toHaveBeenCalledWith(2));
    resolveLoad(loadedWorkbook);
  });

  it("loads all sheets without triggering an editor session bump", async () => {
    const firstSheet: SheetSchema = {
      id: 1,
      sheetNo: 0,
      name: "First",
      order: 0,
      columns: [],
      merges: [],
      uploadedData: [],
      config: null,
      revision: 1,
      loaded: true,
    };
    const unloadedSheet: SheetSchema = {
      ...firstSheet,
      id: 2,
      sheetNo: 1,
      name: "Second",
      loaded: false,
    };
    const loadedWorkbook: WorkbookFull = {
      id: 1,
      publicId: "workbook-1",
      name: "Workbook 1",
      sheets: [firstSheet, unloadedSheet],
      charts: [],
    };
    currentWorkbook = { ...loadedWorkbook, sheets: [firstSheet, unloadedSheet] };
    mocks.reloadCurrentWorkbook.mockResolvedValue({
      ...loadedWorkbook,
      sheets: [firstSheet, { ...unloadedSheet, loaded: true }],
    });

    const { result } = renderHook(() => useWorkspaceView(1));

    await result.current.ensureAllSheetsLoaded();

    expect(mocks.reloadCurrentWorkbook).toHaveBeenCalledWith({
      sheetIds: [1, 2],
    });
    expect(mocks.bumpSession).not.toHaveBeenCalled();
  });
});
