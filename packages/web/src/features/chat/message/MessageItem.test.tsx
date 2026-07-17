import { fireEvent, render, screen } from "@testing-library/react";
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
        isStreaming={false}
        isLastAssistantMessage={false}
        isLastUserMessage={false}
      />,
    );

    const toggles = screen.getAllByRole("button", { name: "思考过程" });
    expect(screen.getByText("第一段思考")).toBeTruthy();
    expect(screen.getByText("第二段思考")).toBeTruthy();

    fireEvent.click(toggles[0]);

    expect(screen.queryByText("第一段思考")).toBeNull();
    expect(screen.getByText("第二段思考")).toBeTruthy();
  });
});
