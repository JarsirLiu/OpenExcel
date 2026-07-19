import { render, screen } from "@testing-library/react";
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
              changeSummary: { changedCellCount: 2, rangeOperationCount: 0 },
              delta: { type: "write", cells: [] },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("2 个单元格")).toBeTruthy();
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
              changeSummary: { changedCellCount: 0, rangeOperationCount: 1 },
              delta: {
                type: "merge",
                operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 3, endCol: 4 }],
              },
            },
          },
        ]}
      />,
    );

    expect(screen.getByText("1 个区域操作")).toBeTruthy();
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
              changeSummary: { changedCellCount: 0, rangeOperationCount: 0 },
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
});
