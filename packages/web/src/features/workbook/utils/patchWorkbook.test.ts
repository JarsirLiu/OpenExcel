import { describe, expect, it } from "vitest";
import type { WorkbookFull } from "@/api/workbooks";
import { patchWorkbookWithDelta } from "./patchWorkbook";

function workbook(): WorkbookFull {
  return {
    id: 1,
    publicId: "wb_1",
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
        config: null,
        revision: 4,
        uploadedData: [{ r: 0, c: 0, v: { v: "old", m: "old", bg: "#fff" } }],
      },
    ],
  };
}

describe("patchWorkbookWithDelta", () => {
  it("clears content without removing cell formatting", () => {
    const result = patchWorkbookWithDelta(
      workbook(),
      10,
      { type: "write", cells: [{ row: 1, col: 1, value: "" }] },
      { baseRevision: 4, revision: 5 },
    );

    expect(result?.sheets[0].uploadedData).toEqual([{ r: 0, c: 0, v: { bg: "#fff" } }]);
    expect(result?.sheets[0].revision).toBe(5);
  });

  it("rejects a delta based on an old sheet revision", () => {
    const result = patchWorkbookWithDelta(
      workbook(),
      10,
      { type: "write", cells: [{ row: 1, col: 1, value: "new" }] },
      { baseRevision: 3, revision: 4 },
    );

    expect(result).toBeNull();
  });
});
