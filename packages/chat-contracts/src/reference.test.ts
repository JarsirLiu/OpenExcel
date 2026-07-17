import { describe, expect, it } from "vitest";
import { formatChatReference, formatUnavailableChatReference } from "./reference.js";

describe("chat references", () => {
  it("formats a sheet reference with its workbook identity", () => {
    expect(
      formatChatReference({
        kind: "sheet",
        workbookId: 2,
        workbookName: "财务数据",
        sheetId: 20,
        sheetName: "Budget",
        sheetNo: 3,
      }),
    ).toContain("workbookId=2, sheetId=20");
  });

  it("formats unavailable targets without suggesting a fallback", () => {
    expect(formatUnavailableChatReference({ kind: "sheet", sheetId: 20 })).toContain(
      "不要猜测其他工作簿或 Sheet",
    );
  });
});
