import { describe, expect, it, vi } from "vitest";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import { WorkbookDocumentStore } from "./WorkbookDocumentStore";

function createWorkbook() {
  return {
    id: 1,
    publicId: "workbook-1",
    name: "Book",
    charts: [],
    sheets: [
      {
        id: 10,
        sheetNo: 1,
        name: "Sheet1",
        order: 0,
        columns: [],
        merges: [],
        uploadedData: [{ r: 0, c: 0, v: { v: 90, m: "90" } }],
        config: null,
        revision: 0,
      },
    ],
  };
}

describe("WorkbookDocumentStore", () => {
  it("applies a cell patch and publishes the changed coordinates", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const listener = vi.fn();
    store.subscribeToChanges(listener);

    const change: SheetEditorChange = {
      kind: "patch",
      sheetId: 10,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
      },
    };

    store.updateSheetContent(change);

    expect(store.getSnapshot()?.sheets[0]?.uploadedData).toEqual([
      { r: 0, c: 0, v: { v: 9, m: "9" } },
    ]);
    expect(listener).toHaveBeenCalledWith({
      kind: "sheet",
      sheetId: 10,
      cells: [{ row: 0, col: 0 }],
      structural: false,
      configChanged: false,
    });
  });

  it("publishes configuration changes when cells change in the same patch", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const listener = vi.fn();
    store.subscribeToChanges(listener);

    store.updateSheetContent({
      kind: "patch",
      sheetId: 10,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
        config: { columnlen: { 0: 120 } },
      },
    });

    expect(listener).toHaveBeenCalledWith({
      kind: "sheet",
      sheetId: 10,
      cells: [{ row: 0, col: 0 }],
      structural: false,
      configChanged: true,
    });
  });

  it("does not publish revision-only changes as chart data changes", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const listener = vi.fn();
    store.subscribeToChanges(listener);

    store.updateSheetRevision(10, 1);

    expect(listener).toHaveBeenCalledWith({
      kind: "sheet",
      sheetId: 10,
      cells: [],
      structural: false,
      configChanged: false,
    });
  });
});
