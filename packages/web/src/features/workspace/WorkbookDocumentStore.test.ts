import { describe, expect, it, vi } from "vitest";
import type { WorkbookFull } from "@/api/workbooks";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import { WorkbookDocumentStore } from "./WorkbookDocumentStore";

function createWorkbook(): WorkbookFull {
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

  it("merges sparse cell patches without dropping imported styles", () => {
    const workbook = createWorkbook();
    workbook.sheets[0].uploadedData = [
      {
        r: 0,
        c: 0,
        v: { v: 90, m: "90", bd: { b: { s: 1 } }, ct: { fa: "0.00" } },
      },
    ];
    const store = new WorkbookDocumentStore(workbook);

    store.updateSheetContent({
      kind: "patch",
      sheetId: 10,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
      },
    });

    expect(store.getSnapshot()?.sheets[0]?.uploadedData).toEqual([
      { r: 0, c: 0, v: { v: 9, m: "9", bd: { b: { s: 1 } }, ct: { fa: "0.00" } } },
    ]);
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

  it("publishes chart changes separately from workbook changes", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const listener = vi.fn();

    store.subscribeToChanges(listener);
    store.updateCharts([]);

    expect(listener).toHaveBeenCalledWith({ kind: "charts" });
  });

  it("replaces the current document with the remote snapshot", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const localChange: SheetEditorChange = {
      kind: "patch",
      sheetId: 10,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: 9, m: "9" } }],
      },
    };

    store.updateSheetContent(localChange);
    store.mergeRemoteSnapshot({
      ...createWorkbook(),
      sheets: [
        {
          ...createWorkbook().sheets[0],
          uploadedData: [{ r: 0, c: 0, v: { v: 100, m: "100" } }],
          revision: 1,
        },
      ],
    });

    expect(store.getSnapshot()?.sheets[0]?.uploadedData).toEqual([
      { r: 0, c: 0, v: { v: 100, m: "100" } },
    ]);
  });

  it("keeps only the current remote document after a revision update", () => {
    const store = new WorkbookDocumentStore(createWorkbook());
    const createChange = (value: number): SheetEditorChange => ({
      kind: "patch",
      sheetId: 10,
      mutation: {
        type: "patch",
        cells: [{ row: 1, col: 1, cell: { v: value, m: String(value) } }],
      },
    });

    store.updateSheetContent(createChange(9));
    store.updateSheetContent(createChange(8));
    store.updateSheetRevision(10, 1, 1);
    store.mergeRemoteSnapshot({
      ...createWorkbook(),
      sheets: [{ ...createWorkbook().sheets[0], revision: 1 }],
    });
    expect(store.getSnapshot()?.sheets[0]?.uploadedData).toEqual([
      { r: 0, c: 0, v: { v: 90, m: "90" } },
    ]);

    store.updateSheetRevision(10, 2, 2);
    store.mergeRemoteSnapshot({
      ...createWorkbook(),
      sheets: [{ ...createWorkbook().sheets[0], revision: 2 }],
    });
    expect(store.getSnapshot()?.sheets[0]?.uploadedData).toEqual([
      { r: 0, c: 0, v: { v: 90, m: "90" } },
    ]);
  });

  it("does not retain a committed AI patch as browser-pending state", () => {
    const store = new WorkbookDocumentStore(createWorkbook());

    store.applyCommittedSheetPatch(
      {
        kind: "patch",
        sheetId: 10,
        mutation: {
          type: "patch",
          cells: [{ row: 1, col: 1, cell: { v: 100, m: "100" } }],
        },
      },
      1,
    );
    store.mergeRemoteSnapshot({
      ...createWorkbook(),
      sheets: [
        {
          ...createWorkbook().sheets[0],
          uploadedData: [{ r: 0, c: 0, v: { v: 120, m: "120" } }],
          revision: 2,
        },
      ],
    });

    expect(store.getSnapshot()?.sheets[0]).toMatchObject({
      revision: 2,
      uploadedData: [{ r: 0, c: 0, v: { v: 120, m: "120" } }],
    });
  });
});
