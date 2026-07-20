import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("keeps a streaming assistant message mounted as new parts arrive", () => {
    const initialMessage = {
      id: "assistant-active",
      role: "assistant",
      parts: [{ type: "text", text: "先读取数据。" }],
    };
    const { container, rerender } = render(<MessageList messages={[initialMessage]} isStreaming />);
    const assistantElement = container.querySelector('[class*="assistantMsg"]');

    rerender(
      <MessageList
        messages={[
          {
            ...initialMessage,
            parts: [...initialMessage.parts, { type: "text", text: "现在开始整理结果。" }],
          },
        ]}
        isStreaming
      />,
    );

    expect(container.querySelector('[class*="assistantMsg"]')).toBe(assistantElement);
  });

  it("streams only the active assistant message", () => {
    render(
      <MessageList
        messages={[
          {
            id: "assistant-previous",
            role: "assistant",
            parts: [{ type: "reasoning", text: "历史消息的思考" }],
          },
          {
            id: "assistant-active",
            role: "assistant",
            parts: [{ type: "reasoning", text: "当前消息的思考" }],
          },
        ]}
        isStreaming
      />,
    );

    expect(screen.queryByText("历史消息的思考")).toBeNull();
    expect(screen.getByText("当前消息的思考")).toBeTruthy();
  });
});
