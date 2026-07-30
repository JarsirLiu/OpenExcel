import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SheetChangeSummary } from "./SheetChangeSummary";

describe("SheetChangeSummary", () => {
  it("renders the server-provided changed cell count", () => {
    render(
      <SheetChangeSummary
        parts={[
          {
            type: "tool-writeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 1, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 2,
                changedRanges: ["A1:B1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "write",
                operations: [
                  { type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 2, value: "x" },
                ],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/2 个单元格/)).toBeTruthy();
  });

  it("renders range operations separately from cell changes", () => {
    render(
      <SheetChangeSummary
        parts={[
          {
            type: "tool-mergeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 1, sheetNo: 1, sheetName: "Sheet1" },
              changeSummary: {
                changedCellCount: 0,
                changedRanges: [],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              delta: {
                type: "merge",
                operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 3, endCol: 4 }],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("1 个操作")).toBeTruthy();
  });

  it("does not render a sheet when the server reports no actual changes", () => {
    render(
      <SheetChangeSummary
        parts={[
          {
            type: "tool-clearCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 2, sheetNo: 1, sheetName: "Sheet2" },
              changeSummary: {
                changedCellCount: 0,
                changedRanges: [],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 0,
              },
              delta: {
                type: "clear",
                operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 3, endCol: 3 }],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.queryByText("修改了 1 个工作表")).toBeNull();
  });

  it("renders the server truncation count without expanding ranges", () => {
    const changedRanges = Array.from({ length: 20 }, (_, index) => `A${index + 1}`);
    render(
      <SheetChangeSummary
        parts={[
          {
            type: "tool-writeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 3, sheetNo: 1, sheetName: "Sheet3" },
              changeSummary: {
                changedCellCount: 21,
                changedRanges,
                omittedRangeCount: 4,
                truncated: true,
                operationCount: 1,
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText(/另有 4 个范围/)).toBeTruthy();
  });

  it("does not reuse an older preview after a later result omits it", () => {
    render(
      <SheetChangeSummary
        parts={[
          {
            type: "tool-writeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 4, sheetNo: 1, sheetName: "Sheet4" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["A1"],
                omittedRangeCount: 0,
                truncated: false,
                operationCount: 1,
              },
              preview: {
                sheetId: 4,
                sheetName: "Sheet4",
                range: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
                rows: [{ row: 1, values: ["old preview"] }],
                merges: [],
                truncated: false,
              },
            },
          },
          {
            type: "tool-writeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 4, sheetNo: 1, sheetName: "Sheet4" },
              changeSummary: {
                changedCellCount: 1,
                changedRanges: ["B2"],
                omittedRangeCount: 1,
                truncated: true,
                operationCount: 1,
              },
              delta: null,
            },
          },
        ]}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "展开 Sheet4 变更预览" }));

    expect(screen.queryByText("old preview")).toBeNull();
  });
});
