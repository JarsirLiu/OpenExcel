import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyInitialMessages, useChatConversation } from "./useChatConversation";

const chatState = vi.hoisted(() => ({
  messages: [] as unknown[],
  status: "ready" as string,
  error: null as Error | null,
  setMessages: vi.fn(),
  sendMessage: vi.fn(),
  stop: vi.fn(),
}));

vi.mock("@ai-sdk/react", () => ({
  useChat: () => chatState,
}));

vi.mock("ai", () => ({
  DefaultChatTransport: vi.fn(),
}));

vi.mock("@/api/chat", () => ({
  fetchMessages: vi.fn().mockResolvedValue({ messages: [], total: 0 }),
  undoLatestRun: vi.fn(),
}));

beforeEach(() => {
  chatState.messages = [];
  chatState.status = "ready";
  chatState.error = null;
  chatState.setMessages.mockReset();
  chatState.sendMessage.mockReset();
  chatState.stop.mockReset();
});

describe("applyInitialMessages", () => {
  it("preserves messages sent while the initial history request is pending", () => {
    const userMessage = { id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] };

    expect(applyInitialMessages([userMessage], [])).toEqual([userMessage]);
  });

  it("loads history when no local message exists", () => {
    const history = [{ id: "assistant-1", role: "assistant", parts: [] }];

    expect(applyInitialMessages([], history)).toEqual(history);
  });
});

describe("useChatConversation mutation boundary", () => {
  it("forwards a completed canonical mutation once without a model request", async () => {
    const onSheetMutation = vi.fn();
    const { rerender } = renderHook(() =>
      useChatConversation({
        sessionId: 1,
        workspaceId: 2,
        initialMessages: [],
        onSheetMutation,
      }),
    );

    chatState.status = "streaming";
    chatState.messages = [
      {
        role: "assistant",
        parts: [
          {
            toolCallId: "tool-1",
            type: "tool-writeCells",
            state: "output-available",
            output: {
              sheetInfo: { sheetId: 7, sheetNo: 1, sheetName: "Data" },
              mutation: {
                sheetId: 7,
                revision: 4,
                changedRanges: [{ startRow: 2, startCol: 3, endRow: 2, endCol: 3 }],
                objectIds: [],
              },
            },
          },
        ],
      },
    ];
    rerender();

    expect(onSheetMutation).toHaveBeenCalledTimes(1);
    expect(onSheetMutation).toHaveBeenCalledWith({
      toolCallId: "tool-1",
      sheetId: 7,
      sheetNo: 1,
      delta: null,
      mutation: {
        sheetId: 7,
        revision: 4,
        changedRanges: [{ startRow: 2, startCol: 3, endRow: 2, endCol: 3 }],
        objectIds: [],
      },
    });

    rerender();
    expect(onSheetMutation).toHaveBeenCalledTimes(1);
  });
});
