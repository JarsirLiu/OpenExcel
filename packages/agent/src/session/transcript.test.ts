import { describe, expect, it } from "vitest";
import {
  appendResponseMessages,
  normalizeToolErrorInputs,
  removeEmptyAssistantMessages,
} from "./transcript.js";

describe("normalizeToolErrorInputs", () => {
  it("repairs legacy failed tool parts without changing valid inputs", () => {
    const legacy = {
      id: "assistant-1",
      role: "assistant",
      parts: [
        {
          type: "tool-createChart",
          toolCallId: "call-1",
          state: "output-error",
          errorText: "工具结果未完成",
        },
        {
          type: "tool-createChart",
          toolCallId: "call-2",
          state: "output-error",
          input: "{bad json",
          errorText: "参数无效",
        },
      ],
    };

    expect(normalizeToolErrorInputs([legacy])).toEqual([
      {
        ...legacy,
        parts: [{ ...legacy.parts[0], input: {} }, legacy.parts[1]],
      },
    ]);
  });
});

describe("removeEmptyAssistantMessages", () => {
  it("removes an empty assistant placeholder left by a failed stream", () => {
    const messages = [
      { role: "user", parts: [{ type: "text", text: "你好" }] },
      { role: "assistant", parts: [] },
      { role: "user", parts: [{ type: "text", text: "你是谁" }] },
    ];

    expect(removeEmptyAssistantMessages(messages)).toEqual([messages[0], messages[2]]);
  });

  it("keeps assistant messages that contain content", () => {
    const message = { role: "assistant", parts: [{ type: "text", text: "我是 AI" }] };

    expect(removeEmptyAssistantMessages([message])).toEqual([message]);
  });
});

describe("appendResponseMessages", () => {
  it("generates unique assistant IDs for each user turn", () => {
    const firstTurn = [{ id: "user-1", role: "user", parts: [] }];
    const secondTurn = [
      ...firstTurn,
      { id: "assistant-user-1-1", role: "assistant", parts: [{ type: "text", text: "第一轮" }] },
      { id: "user-2", role: "user", parts: [] },
    ];

    const first = appendResponseMessages(firstTurn, [
      { role: "assistant", content: [{ type: "text", text: "第一轮" }] },
    ]);
    const second = appendResponseMessages(secondTurn, [
      { role: "assistant", content: [{ type: "text", text: "第二轮" }] },
    ]);

    expect(first.at(-1)?.id).toBe("assistant-user-1-1");
    expect(second.at(-1)?.id).toBe("assistant-user-2-1");
  });

  it("preserves tool errors for the next model turn", () => {
    const transcript = [{ id: "user-1", role: "user", parts: [] }];

    expect(
      appendResponseMessages(transcript, [
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolName: "createChart",
              toolCallId: "call-1",
              input: { sheetId: "wrong" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-error",
              toolName: "createChart",
              toolCallId: "call-1",
              input: { sheetId: "wrong" },
              error: { message: "createChart: sheetId must be a number" },
            },
          ],
        },
      ]),
    ).toEqual([
      transcript[0],
      {
        id: "assistant-user-1-1",
        role: "assistant",
        parts: [
          {
            type: "tool-createChart",
            toolCallId: "call-1",
            state: "output-error",
            input: { sheetId: "wrong" },
            errorText: "createChart: sheetId must be a number",
          },
        ],
      },
    ]);
  });

  it("recognizes the model-visible error envelope returned by a tool adapter", () => {
    const transcript = [{ id: "user-1", role: "user", parts: [] }];

    expect(
      appendResponseMessages(transcript, [
        {
          role: "assistant",
          content: [
            { type: "tool-call", toolName: "readSheetData", toolCallId: "call-1", input: {} },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolName: "readSheetData",
              toolCallId: "call-1",
              output: {
                isError: true,
                error: { kind: "not_found", message: "工作表不存在" },
              },
            },
          ],
        },
      ]),
    ).toMatchObject([
      transcript[0],
      {
        parts: [
          {
            state: "output-error",
            errorText: "工作表不存在",
          },
        ],
      },
    ]);
  });
});
