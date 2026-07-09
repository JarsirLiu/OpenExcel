import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallCard } from "./ToolCallCard";

describe("ToolCallCard", () => {
  it("shows workbook-local sheet numbers for readSheet results", () => {
    render(
      <ToolCallCard
        part={{
          type: "tool-readSheet",
          toolName: "readSheet",
          state: "output-available",
          toolCallId: "tool-call-1",
          input: { sheetId: 3 },
          output: {
            sheetInfo: { sheetNo: 3, sheetName: "Budget" },
            sheetName: "Budget",
            sheetNo: 3,
            rowCount: 2,
            columnCount: 2,
            headers: [],
            data: [],
            merges: [],
          },
        }}
      />,
    );

    expect(screen.getByText("读取 Budget (#3)")).toBeTruthy();
    expect(screen.getByText("读取了 Sheet: Budget (#3)")).toBeTruthy();
    expect(screen.queryByText(/id:\s*3/i)).toBeNull();
  });
});
