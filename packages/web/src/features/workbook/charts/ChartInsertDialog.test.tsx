import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ChartInsertDialog } from "./ChartInsertDialog";

describe("ChartInsertDialog", () => {
  it("renders a visible confirmation action", () => {
    render(
      <ChartInsertDialog
        open
        workbookId={1}
        sheetId={2}
        sheetName="Sheet1"
        selection={{ startRow: 0, endRow: 2, startCol: 0, endCol: 1 }}
        onClose={vi.fn()}
        onCreate={vi.fn().mockResolvedValue(undefined)}
      />,
    );

    expect(screen.getByRole("button", { name: "确认创建图表" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认创建图表" })).toHaveTextContent("确认生成图表");
  });
});
