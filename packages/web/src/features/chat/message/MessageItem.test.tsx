import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MessageItem } from "./MessageItem";

describe("MessageItem", () => {
  it("keeps completed text mounted when a tool part is appended", () => {
    const initialMessage = {
      id: "assistant-tool-transition",
      role: "assistant",
      parts: [{ type: "text", text: "先读取数据。" }],
    };
    const { container, rerender } = render(
      <MessageItem msg={initialMessage} isMessageStreaming isLastAssistantMessage={false} />,
    );
    const markdownElement = container.querySelector('[class*="markdown"]');

    rerender(
      <MessageItem
        msg={{
          ...initialMessage,
          parts: [
            ...initialMessage.parts,
            {
              type: "tool-readSheetData",
              toolCallId: "tool-read-1",
              state: "output-available",
              input: {},
              output: {},
            },
          ],
        }}
        isMessageStreaming
        isLastAssistantMessage={false}
      />,
    );

    expect(container.querySelector('[class*="markdown"]')).toBe(markdownElement);
  });

  it("renders the text from an AI SDK reasoning part", () => {
    render(
      <MessageItem
        msg={{
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "reasoning", text: "先读取目标 Sheet，再整理结果。" }],
        }}
        isMessageStreaming={true}
        isLastAssistantMessage={false}
      />,
    );

    expect(screen.getByText("先读取目标 Sheet，再整理结果。")).toBeTruthy();
  });

  it("toggles reasoning parts independently", () => {
    render(
      <MessageItem
        msg={{
          id: "assistant-2",
          role: "assistant",
          parts: [
            { type: "reasoning", text: "第一段思考" },
            { type: "reasoning", text: "第二段思考" },
          ],
        }}
        isMessageStreaming={true}
        isLastAssistantMessage={false}
      />,
    );

    const toggles = screen.getAllByRole("button", { name: "思考过程" });
    expect(screen.getByText("第一段思考")).toBeTruthy();
    expect(screen.getByText("第二段思考")).toBeTruthy();

    fireEvent.click(toggles[0]);

    expect(screen.queryByText("第一段思考")).toBeNull();
    expect(screen.getByText("第二段思考")).toBeTruthy();
  });

  it("collapses reasoning automatically when streaming ends", () => {
    const { rerender } = render(
      <MessageItem
        msg={{
          id: "assistant-3",
          role: "assistant",
          parts: [{ type: "reasoning", text: "正在思考中..." }],
        }}
        isMessageStreaming={true}
        isLastAssistantMessage={false}
      />,
    );

    expect(screen.getByText("正在思考中...")).toBeTruthy();

    rerender(
      <MessageItem
        msg={{
          id: "assistant-3",
          role: "assistant",
          parts: [{ type: "reasoning", text: "正在思考中..." }],
        }}
        isMessageStreaming={false}
        isLastAssistantMessage={false}
      />,
    );

    expect(screen.queryByText("正在思考中...")).toBeNull();
  });

  it("renders undo on the latest assistant message", () => {
    render(
      <MessageItem
        msg={{ id: "assistant-undo", role: "assistant", parts: [{ type: "text", text: "已修改" }] }}
        isMessageStreaming={false}
        isLastAssistantMessage
        onUndo={vi.fn()}
      />,
    );

    expect(screen.getByRole("button", { name: "撤销" })).toBeTruthy();
  });

  it("does not render undo on a user message", () => {
    render(
      <MessageItem
        msg={{ id: "user-undo", role: "user", parts: [{ type: "text", text: "请修改" }] }}
        isMessageStreaming={false}
        isLastAssistantMessage={false}
        onUndo={vi.fn()}
      />,
    );

    expect(screen.queryByRole("button", { name: "撤销" })).toBeNull();
  });
});
