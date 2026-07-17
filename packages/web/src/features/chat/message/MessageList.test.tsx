import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MessageList } from "./MessageList";

describe("MessageList", () => {
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
