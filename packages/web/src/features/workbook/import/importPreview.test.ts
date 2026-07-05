import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildWorkbookImportPreview } from "./importPreview";
import type { WorkbookFull } from "../../../api/workbooks";

function makeFile(): File {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([
      ["Name", "Age"],
      ["Alice", "30"],
      ["Bob", "25"],
    ]),
    "Sheet1",
  );
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.aoa_to_sheet([["Extra"]]),
    "Extra",
  );
  const buffer = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  return new File([buffer], "sample.xlsx", {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("buildWorkbookImportPreview", () => {
  it("summarizes matched, missing and extra sheets", async () => {
    const workbook: WorkbookFull = {
      id: 1,
      name: "Demo",
      sheets: [
        {
          id: 11,
          sheetNo: 1,
          name: "Sheet1",
          order: 0,
          columns: [{ label: "Name" }, { label: "Age" }],
          merges: [],
          uploadedData: [
            { r: 0, c: 0, v: { v: "Name", m: "Name" } },
            { r: 0, c: 1, v: { v: "Age", m: "Age" } },
            { r: 1, c: 0, v: { v: "Alice", m: "Alice" } },
            { r: 1, c: 1, v: { v: "31", m: "31" } },
          ],
          config: null,
        },
        {
          id: 12,
          sheetNo: 2,
          name: "MissingSheet",
          order: 1,
          columns: [{ label: "A" }],
          merges: [],
          uploadedData: [],
          config: null,
        },
      ],
    };

    const preview = await buildWorkbookImportPreview(workbook, makeFile());

    expect(preview.currentSheetCount).toBe(2);
    expect(preview.uploadedSheetCount).toBe(2);
    expect(preview.matchedCount).toBe(1);
    expect(preview.missingCount).toBe(1);
    expect(preview.extraCount).toBe(1);

    const matched = preview.sheets.find((sheet: (typeof preview.sheets)[number]) => sheet.name === "Sheet1");
    expect(matched?.changedCells).toBe(1);
    expect(matched?.sampleDiffs[0]).toMatchObject({
      row: 1,
      col: 1,
      kind: "changed",
      currentValue: "31",
      uploadedValue: "30",
    });
  });
});
