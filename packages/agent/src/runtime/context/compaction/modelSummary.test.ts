import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  generateText: vi.fn(),
  object: vi.fn(() => ({ name: "object" })),
}));

vi.mock("ai", () => ({
  generateText: mocks.generateText,
  Output: { object: mocks.object },
}));

import { createContextSummaryGenerator } from "./modelSummary.js";

describe("createContextSummaryGenerator", () => {
  it("uses the supplied chat model without tools and reports usage separately", async () => {
    const summary = {
      goal: ["goal"],
      constraints: [],
      completed: [],
      inProgress: [],
      blocked: [],
      decisions: [],
      nextSteps: [],
      criticalFacts: [],
      references: [],
    };
    mocks.generateText.mockResolvedValue({ output: summary, usage: { inputTokens: 12 } });
    const onUsage = vi.fn();
    const model = { modelId: "chat-model", provider: "openexcel.chat" } as never;

    const result = await createContextSummaryGenerator({
      model,
      maxOutputTokens: 200,
      onUsage,
    }).generate({
      previousSummary: undefined,
      messages: [{ role: "user", content: "history" }],
      coveredTranscriptCursor: 4,
    });

    expect(result).toBe(summary);
    expect(mocks.object).toHaveBeenCalledWith(expect.objectContaining({ name: "context_summary" }));
    expect(mocks.generateText).toHaveBeenCalledWith(
      expect.objectContaining({
        model,
        maxOutputTokens: 200,
        maxRetries: 0,
        providerOptions: {
          openexcel: { reasoningEffort: "none", strictJsonSchema: true },
        },
      }),
    );
    expect(mocks.generateText.mock.calls[0][0].tools).toBeUndefined();
    expect(onUsage).toHaveBeenCalledWith(expect.objectContaining({ inputTokens: 12 }));
  });
});
