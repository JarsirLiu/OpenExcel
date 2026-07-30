import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
  it("renders a transient assistant waiting row without adding a message", () => {
    const { container } = render(
      <MessageList
        messages={[{ id: "user-1", role: "user", parts: [{ type: "text", text: "你好" }] }]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-1",
          phase: "model-waiting",
          showPulse: true,
        }}
      />,
    );

    expect(screen.getByLabelText("AI 正在响应")).toBeTruthy();
    expect(container.querySelectorAll('[class*="assistantMsg"]').length).toBe(0);
  });

  it("renders the waiting pulse inside the active assistant message", () => {
    const { container } = render(
      <MessageList
        messages={[{ id: "assistant-1", role: "assistant", parts: [] }]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-1",
          phase: "model-waiting",
          showPulse: true,
        }}
      />,
    );

    expect(screen.getByLabelText("AI 正在响应")).toBeTruthy();
    expect(container.querySelectorAll('[class*="assistantMsg"]')).toHaveLength(1);
  });

  it("keeps a streaming assistant message mounted as new parts arrive", () => {
    const initialMessage = {
      id: "assistant-active",
      role: "assistant",
      parts: [{ type: "text", text: "先读取数据。" }],
    };
    const { container, rerender } = render(
      <MessageList
        messages={[initialMessage]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-active",
          phase: "responding",
          showPulse: false,
        }}
      />,
    );
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
        assistantActivity={{
          assistantMessageId: "assistant-active",
          phase: "responding",
          showPulse: false,
        }}
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
        assistantActivity={{
          assistantMessageId: "assistant-active",
          phase: "responding",
          showPulse: false,
        }}
      />,
    );

    expect(screen.queryByText("历史消息的思考")).toBeNull();
    expect(screen.getByText("当前消息的思考")).toBeTruthy();
  });

  it("renders compaction progress inside the assistant message", () => {
    const { container, rerender } = render(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "text", text: "之前" },
              {
                id: "compaction-1",
                type: "automatic-context-compaction",
                status: "running",
              },
            ],
          },
        ]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-1",
          phase: "compacting",
          showPulse: false,
        }}
      />,
    );

    expect(screen.getByRole("status")).toHaveTextContent("正在压缩上下文...");
    expect(container.querySelectorAll('[class*="assistantMsg"]')).toHaveLength(1);

    rerender(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              { type: "text", text: "之前" },
              {
                id: "compaction-1",
                type: "automatic-context-compaction",
                status: "completed",
              },
            ],
          },
        ]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-1",
          phase: "compacting",
          showPulse: false,
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("上下文已压缩");

    rerender(
      <MessageList
        messages={[
          {
            id: "assistant-1",
            role: "assistant",
            parts: [
              {
                id: "compaction-1",
                type: "automatic-context-compaction",
                status: "failed",
              },
            ],
          },
        ]}
        isStreaming
        assistantActivity={{
          assistantMessageId: "assistant-1",
          phase: "compacting",
          showPulse: false,
        }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("!上下文压缩失败");
  });
});
