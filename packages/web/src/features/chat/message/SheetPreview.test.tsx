import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizePreviewData, SheetPreview } from "./SheetPreview";

describe("SheetPreview", () => {
  it("normalizes malformed rows without throwing during render", () => {
    const preview = normalizePreviewData({
      sheetName: "Budget",
      rows: [{ values: ["A", 1] }, { 0: "B", 1: 2 }, "plain"],
      merges: [],
      range: { startRow: 1, endRow: 3, startCol: 1, endCol: 2 },
    });

    expect(preview?.rows).toEqual([["A", "1"], ["B", "2"], ["plain"]]);
    render(<SheetPreview preview={preview!} />);
    expect(screen.getByText("plain")).toBeTruthy();
  });

  it("ignores a non-array rows payload", () => {
    expect(normalizePreviewData({ rows: {}, merges: [] })?.rows).toEqual([]);
  });

  it("does not throw when a caller passes malformed preview data", () => {
    expect(() => render(<SheetPreview preview={{ rows: [{ value: "bad" }] }} />)).not.toThrow();
  });
});
