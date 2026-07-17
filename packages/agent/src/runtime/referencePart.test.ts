import { describe, expect, it } from "vitest";
import { convertChatReferenceDataPart } from "./streamChat.js";

describe("convertChatReferenceDataPart", () => {
  it("turns a resolved reference into model-readable identity text", () => {
    expect(
      convertChatReferenceDataPart({
        type: "data-chat-reference",
        data: {
          reference: {
            kind: "sheet",
            workbookId: 2,
            workbookName: "财务数据",
            sheetId: 20,
            sheetName: "Budget",
          },
          status: "resolved",
        },
      }),
    ).toEqual({
      type: "text",
      text: expect.stringContaining("workbookId=2, sheetId=20"),
    });
  });

  it("warns the model when a referenced target is no longer available", () => {
    expect(
      convertChatReferenceDataPart({
        type: "data-chat-reference",
        data: {
          reference: { kind: "sheet", sheetId: 99 },
          status: "unavailable",
        },
      }),
    ).toEqual({
      type: "text",
      text: expect.stringContaining("不要猜测其他工作簿或 Sheet"),
    });
  });
});
