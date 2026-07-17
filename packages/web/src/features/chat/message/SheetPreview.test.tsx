import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { normalizePreviewData, SheetPreview } from "./SheetPreview";

describe("SheetPreview", () => {
  it("normalizes new-format rows that already carry explicit row numbers", () => {
    const preview = normalizePreviewData({
      sheetName: "Budget",
      rows: [
        { row: 3, values: ["A", 1] },
        { row: 4, values: ["B", 2] },
      ],
      merges: [],
      range: { startRow: 3, endRow: 4, startCol: 1, endCol: 2 },
    });

    expect(preview?.rows).toEqual([
      { row: 3, values: ["A", "1"] },
      { row: 4, values: ["B", "2"] },
    ]);
  });

  it("falls back to range.startRow + index for legacy rows without explicit row numbers", () => {
    const preview = normalizePreviewData({
      sheetName: "Budget",
      // 旧规范：{ values: [] } / 字典数组 / 裸字符串。行号应回退到 startRow + index。
      rows: [{ values: ["A", 1] }, { 0: "B", 1: 2 }, "plain"],
      merges: [],
      range: { startRow: 1, endRow: 3, startCol: 1, endCol: 2 },
    });

    expect(preview?.rows).toEqual([
      { row: 1, values: ["A", "1"] },
      { row: 2, values: ["B", "2"] },
      { row: 3, values: ["plain"] },
    ]);
    render(<SheetPreview preview={preview!} />);
    expect(screen.getByText("plain")).toBeTruthy();
  });

  it("ignores a non-array rows payload", () => {
    expect(normalizePreviewData({ rows: {}, merges: [] })?.rows).toEqual([]);
  });

  it("does not throw when a caller passes malformed preview data", () => {
    expect(() => render(<SheetPreview preview={{ rows: [{ value: "bad" }] }} />)).not.toThrow();
  });

  it("renders merge spans keyed by the explicit row number", () => {
    // 服务端给出 row=2 的合并，跨 2 行 2 列；前端不应依赖数组下标推断。
    const preview = normalizePreviewData({
      sheetName: "Sheet1",
      rows: [
        { row: 1, values: ["header", ""] },
        { row: 2, values: ["merged", ""] },
        { row: 3, values: ["", ""] },
      ],
      merges: [{ startRow: 2, startCol: 1, endRow: 3, endCol: 2 }],
      range: { startRow: 1, endRow: 3, startCol: 1, endCol: 2 },
    });

    render(<SheetPreview preview={preview!} />);
    expect(screen.getByText("merged")).toBeTruthy();
  });
});
