import { describe, expect, it } from "vitest";
import { resolveChatMessageReferences } from "./references.js";

const workbooks = [
  {
    id: 1,
    name: "销售数据",
    sheets: [{ id: 10, name: "Budget", sheetNo: 1 }],
  },
  {
    id: 2,
    name: "财务数据",
    sheets: [{ id: 20, name: "Budget", sheetNo: 1 }],
  },
];

describe("resolveChatMessageReferences", () => {
  it("resolves a reference by sheet id rather than sheet name", () => {
    const [message] = resolveChatMessageReferences(
      [
        {
          role: "user",
          parts: [
            {
              type: "data-chat-reference",
              data: { reference: { kind: "sheet", sheetId: 20 } },
            },
          ],
        },
      ],
      workbooks,
    );

    const part = (message.parts as Array<Record<string, unknown>>)[0];
    expect(part?.data).toEqual({
      reference: {
        kind: "sheet",
        workbookId: 2,
        workbookName: "财务数据",
        sheetId: 20,
        sheetName: "Budget",
        sheetNo: 1,
      },
      status: "resolved",
    });
  });

  it("marks a deleted target unavailable instead of silently retargeting it", () => {
    const [message] = resolveChatMessageReferences(
      [
        {
          role: "user",
          parts: [
            {
              type: "data-chat-reference",
              data: { reference: { kind: "sheet", sheetId: 99 } },
            },
          ],
        },
      ],
      workbooks,
    );

    const part = (message.parts as Array<Record<string, unknown>>)[0];
    expect(part?.data).toEqual({
      reference: { kind: "sheet", sheetId: 99 },
      status: "unavailable",
    });
  });
});
