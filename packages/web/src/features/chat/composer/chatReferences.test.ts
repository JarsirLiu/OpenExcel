import { describe, expect, it } from "vitest";
import { extractChatReferences } from "./chatReferences";

describe("extractChatReferences", () => {
  it("extracts exact sheet ids and keeps duplicate sheet names distinct", () => {
    expect(
      extractChatReferences({
        type: "doc",
        content: [
          { type: "mention", attrs: { id: "sheet:10", label: "Budget" } },
          { type: "mention", attrs: { id: "sheet:20", label: "Budget" } },
        ],
      }),
    ).toEqual([
      { kind: "sheet", sheetId: 10 },
      { kind: "sheet", sheetId: 20 },
    ]);
  });

  it("deduplicates repeated mentions of the same target", () => {
    expect(
      extractChatReferences({
        type: "doc",
        content: [
          { type: "mention", attrs: { id: "workbook:3" } },
          { type: "mention", attrs: { id: "workbook:3" } },
        ],
      }),
    ).toEqual([{ kind: "workbook", workbookId: 3 }]);
  });
});
