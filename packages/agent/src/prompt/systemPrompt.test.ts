import { describe, expect, it } from "vitest";
import { buildSystemPrompt, DEFAULT_PROMPT } from "./systemPrompt.js";

describe("system prompt", () => {
  it("keeps a strict permission boundary for Excel operations", () => {
    expect(DEFAULT_PROMPT).toContain("只调用已提供的工具");
    expect(DEFAULT_PROMPT).toContain("先理解请求中的目标、对象、操作、范围和验收标准");
    expect(DEFAULT_PROMPT).toContain(
      "如果目标、范围、原始数据处理方式或预期结果存在会影响正确性的歧义",
    );
    expect(DEFAULT_PROMPT).toContain("工具报错、结果被截断或核验不通过时，不要无限重复调用工具");
  });

  it("delegates tool-specific rules to the tool catalog", () => {
    expect(DEFAULT_PROMPT).not.toContain("overview 模式");
    expect(DEFAULT_PROMPT).not.toContain("mode=range");
    expect(DEFAULT_PROMPT).not.toContain("writeCells");
  });

  it("requires concise, result-oriented responses", () => {
    expect(DEFAULT_PROMPT).toContain("先完成需求理解和必要的确认");
    expect(DEFAULT_PROMPT).toContain("执行完成后的最终回复通常控制在 1-3 句");
    expect(DEFAULT_PROMPT).toContain("不复述用户问题、工具调用过程或详细思考过程");
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
