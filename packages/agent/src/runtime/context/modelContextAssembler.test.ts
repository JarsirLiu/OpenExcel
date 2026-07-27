import { describe, expect, it } from "vitest";
import { assembleModelContext } from "./modelContextAssembler.js";

describe("assembleModelContext", () => {
  it("adds the summary as a model-only context message", () => {
    const messages = [{ role: "user", content: "recent" }];
    const tools = [{ name: "read_sheet" }];
    const result = assembleModelContext({
      baseSystemPrompt: "base",
      summary: {
        goal: ["goal"],
        constraints: [],
        completed: [],
        inProgress: [],
        blocked: [],
        decisions: [],
        nextSteps: [],
        criticalFacts: [],
        references: [],
      },
      recentMessages: messages,
      actualToolDefinitions: tools,
    });

    expect(result.system).toBe("base");
    expect(result.messages).toHaveLength(2);
    expect(result.messages[0]).toEqual({
      id: "context-summary",
      role: "user",
      parts: [
        {
          type: "text",
          text: expect.stringContaining("<context-summary>"),
        },
      ],
    });
    expect(result.messages[1]).toBe(messages[0]);
    expect(result.tools).toBe(tools);
  });

  it("keeps the base system prompt unchanged when no checkpoint exists", () => {
    expect(
      assembleModelContext({
        baseSystemPrompt: "base",
        recentMessages: [],
        actualToolDefinitions: [],
      }).system,
    ).toBe("base");
  });
});
