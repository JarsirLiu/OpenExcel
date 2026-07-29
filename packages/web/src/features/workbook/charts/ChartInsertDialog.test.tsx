import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/lib/i18n";
import { ChartInsertDialog } from "./ChartInsertDialog";

describe("ChartInsertDialog", () => {
  it("renders a visible confirmation action", () => {
    render(
      <I18nProvider>
        <ChartInsertDialog
          open
          workbookId={1}
          sheetId={2}
          sheetName="Sheet1"
          selection={{ startRow: 0, endRow: 2, startCol: 0, endCol: 1 }}
          onClose={vi.fn()}
          onCreate={vi.fn().mockResolvedValue(undefined)}
        />
      </I18nProvider>,
    );

    expect(screen.getByRole("button", { name: "确认生成图表" })).toBeVisible();
    expect(screen.getByRole("button", { name: "确认生成图表" })).toHaveTextContent("确认生成图表");
  });
});
