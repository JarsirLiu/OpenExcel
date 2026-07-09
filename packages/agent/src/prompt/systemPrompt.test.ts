import { describe, expect, it } from "vitest";
import { buildSystemPrompt, DEFAULT_PROMPT } from "./systemPrompt.js";

describe("system prompt", () => {
  it("keeps a strict permission boundary for Excel operations", () => {
    expect(DEFAULT_PROMPT).toContain("未经用户明确允许");
    expect(DEFAULT_PROMPT).toContain("不要擅自动 Excel");
    expect(DEFAULT_PROMPT).toContain("意图不明先确认");
  });

  it("includes the prompt, catalog, and context in the final system prompt", () => {
    const systemPrompt = buildSystemPrompt("workspace context", "- **readSheet**: read data");

    expect(systemPrompt).toContain(DEFAULT_PROMPT);
    expect(systemPrompt).toContain("## 可用工具");
    expect(systemPrompt).toContain("- **readSheet**: read data");
    expect(systemPrompt).toContain("## 当前工作区目录");
    expect(systemPrompt).toContain("workspace context");
  });
});
