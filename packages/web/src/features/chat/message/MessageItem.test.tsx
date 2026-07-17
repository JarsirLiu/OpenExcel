import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageItem } from "./MessageItem";

describe("MessageItem", () => {
  it("renders the text from an AI SDK reasoning part", () => {
    render(
      <MessageItem
        msg={{
          id: "assistant-1",
          role: "assistant",
          parts: [{ type: "reasoning", text: "先读取目标 Sheet，再整理结果。" }],
        }}
        isStreaming={false}
        isLastAssistantMessage={false}
        isLastUserMessage={false}
      />,
    );

    expect(screen.getByText("先读取目标 Sheet，再整理结果。")).toBeTruthy();
  });
});
