import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SheetSchema, WorkbookFull } from "@/api/workbooks";

const mocks = vi.hoisted(() => ({
  fetchSheet: vi.fn(),
  toast: vi.fn(),
  replaceCurrentWorkbook: vi.fn(),
  updateCurrentWorkbook: vi.fn(),
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
    workbookRevision: 0,
    loading: false,
    replaceCurrentWorkbook: mocks.replaceCurrentWorkbook,
    updateCurrentWorkbook: mocks.updateCurrentWorkbook,
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
    transition: null,
    retryTransition: vi.fn(),
    switchWorkbook: vi.fn(),
  }),
}));

vi.mock("./useWorkbookDocument", () => ({
  useWorkbookDocument: () => ({
    currentWorkbook,
    currentWorkbookRef: { current: currentWorkbook },
    workbookRevision: 0,
    replaceCurrentWorkbook: mocks.replaceCurrentWorkbook,
    updateCurrentWorkbook: (updater: (workbook: WorkbookFull) => WorkbookFull) => {
      if (currentWorkbook) {
        currentWorkbook = updater(currentWorkbook);
        mocks.replaceCurrentWorkbook(currentWorkbook);
      }
      return currentWorkbook;
    },
    updateCharts: vi.fn(),
    updateSheetRevision: vi.fn(),
    updateWorkbookMetadata: vi.fn(),
    loadWorkbook: vi.fn().mockResolvedValue(null),
    reloadCurrentWorkbook: vi.fn().mockResolvedValue(null),
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
    mocks.updateCurrentWorkbook.mockReset();
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
});
