import { describe, expect, it } from "vitest";
import { buildToolPreview } from "./toolPreview.js";

describe("tool preview", () => {
  it("maps canonical cells and merge objects to one-based preview data", () => {
    const preview = buildToolPreview(
      { sheetId: 7, name: "Data" },
      { startRow: 1, startCol: 2, endRow: 2, endCol: 3 },
      [
        { row: 1, col: 2, value: { value: 42, displayValue: "42" } },
        { row: 8, col: 8, value: { value: "ignored" } },
      ],
      [
        {
          type: "custom",
          position: { startRow: 1, startCol: 2, endRow: 2, endCol: 3 },
          data: { kind: "merge" },
        },
      ],
    );

    expect(preview).toEqual({
      sheetId: 7,
      sheetName: "Data",
      range: { startRow: 2, startCol: 3, endRow: 3, endCol: 4 },
      rows: [
        ["42", ""],
        ["", ""],
      ],
      merges: [{ startRow: 2, startCol: 3, endRow: 3, endCol: 4 }],
    });
  });
});
