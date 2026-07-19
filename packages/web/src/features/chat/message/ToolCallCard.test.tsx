import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToolCallCard } from "./ToolCallCard";

describe("ToolCallCard", () => {
  it("shows workbook-local sheet numbers for readSheetData results", () => {
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
            values: [],
          },
        }}
      />,
    );

    expect(screen.getByText("读取 Budget (#3)")).toBeTruthy();
    expect(screen.getByText("读取了 Sheet: Budget (#3)")).toBeTruthy();
    expect(screen.queryByText(/id:\s*3/i)).toBeNull();
  });
});
