import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallCard } from "./ToolCallCard";

describe("ToolCallCard", () => {
  it("shows workbook-local sheet numbers without rendering read data", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-readSheetData",
          toolName: "readSheetData",
          state: "output-available",
          toolCallId: "tool-call-1",
          input: { sheetId: 3 },
          output: {
            sheet: { sheetNo: 3, name: "Budget" },
            range: "A1:B2",
            preview: {
              sheetId: 3,
              sheetName: "Budget",
              range: { startRow: 1, endRow: 2, startCol: 1, endCol: 2 },
              rows: [
                { row: 1, values: ["Month", "Amount"] },
                { row: 2, values: ["January", "100"] },
              ],
              merges: [],
            },
          },
        }}
      />,
    );

    expect(screen.getByText("读取 Budget (#3)")).toBeTruthy();
    expect(screen.getByText("读取了 Sheet: Budget (#3)")).toBeTruthy();
    expect(screen.queryByText("Budget — 变更区域 (A1:B2)")).toBeNull();
    expect(screen.queryByText("January")).toBeNull();
    expect(screen.queryByText(/id:\s*3/i)).toBeNull();
  });

  it("keeps previews for sheet-changing tools", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-writeCells",
          toolName: "writeCells",
          state: "output-available",
          input: { sheetId: 3 },
          output: {
            sheetInfo: { sheetId: 3, sheetNo: 3, sheetName: "Budget" },
            preview: {
              sheetId: 3,
              sheetName: "Budget",
              range: { startRow: 1, endRow: 1, startCol: 1, endCol: 1 },
              rows: [{ row: 1, values: ["Updated"] }],
              merges: [],
            },
            delta: { type: "write", cells: [{ row: 1, col: 1 }] },
          },
        }}
      />,
    );

    expect(screen.getByText("Budget — 变更区域 (A1:A1)")).toBeTruthy();
    expect(screen.getByText("Updated")).toBeTruthy();
  });
});
