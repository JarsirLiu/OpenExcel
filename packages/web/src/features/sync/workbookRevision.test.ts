import { describe, expect, it } from "vitest";
import type { WorkbookFull } from "@/api/workbooks";
import { isWorkbookSnapshotStale } from "./workbookRevision";

function workbook(revisions: number[]): WorkbookFull {
  return {
    id: 1,
    publicId: "wb-1",
    name: "Book",
    charts: [],
    sheets: revisions.map((revision, index) => ({
      id: index + 1,
      sheetNo: index + 1,
      name: `Sheet${index + 1}`,
      order: index,
      columns: [],
      merges: [],
      uploadedData: [],
      config: null,
      revision,
    })),
  };
}

describe("isWorkbookSnapshotStale", () => {
  it("rejects a snapshot older than the current Sheet revision", () => {
    expect(isWorkbookSnapshotStale(workbook([2]), workbook([1]))).toBe(true);
  });

  it("accepts a snapshot with equal or newer Sheet revisions", () => {
    expect(isWorkbookSnapshotStale(workbook([1, 3]), workbook([1, 4]))).toBe(false);
  });

  it("does not compare different workbooks", () => {
    const next = { ...workbook([0]), id: 2 };
    expect(isWorkbookSnapshotStale(workbook([2]), next)).toBe(false);
  });
});
