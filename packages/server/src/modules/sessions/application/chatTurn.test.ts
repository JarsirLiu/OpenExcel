import { describe, expect, it } from "vitest";
import { appendChatTurn, parseChatTurnRequest } from "./chatTurn.js";

describe("chat turn contract", () => {
  const request = {
    requestId: "request-1",
    message: {
      messageId: "message-1",
      role: "user" as const,
      parts: [{ type: "text" as const, text: "读取当前工作簿" }],
    },
  };

  it("accepts a single user turn", () => {
    expect(parseChatTurnRequest(request)).toEqual(request);
  });

  it("rejects client-supplied history and model messages", () => {
    expect(() =>
      parseChatTurnRequest({
        ...request,
        messages: [{ role: "assistant", parts: [] }],
      }),
    ).toThrow();

    expect(() =>
      parseChatTurnRequest({
        ...request,
        message: { ...request.message, role: "assistant" },
      }),
    ).toThrow();
  });

  it("appends only the server-normalized user turn to canonical history", () => {
    const history = [{ id: "old", role: "assistant", parts: [{ type: "text", text: "旧消息" }] }];

    expect(appendChatTurn(history, request)).toEqual([
      ...history,
      {
        id: "message-1",
        role: "user",
        parts: [{ type: "text", text: "读取当前工作簿" }],
      },
    ]);
  });
});
