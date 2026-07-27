import { describe, expect, it } from "vitest";
import { validateContextSummary } from "./summary.js";
import { ContextCompactionError } from "./types.js";

const summary = {
  goal: ["完成上下文压缩"],
  constraints: ["不能破坏工具调用链"],
  completed: ["完成预算规划"],
  inProgress: ["接入 checkpoint"],
  blocked: [],
  decisions: [{ decision: "使用结构化摘要", reason: "便于校验" }],
  nextSteps: ["接入模型步骤边界"],
  criticalFacts: ["完整 transcript 仍是事实源"],
  references: [{ label: "文档", value: "docs/context-compaction.md" }],
};

describe("validateContextSummary", () => {
  it("accepts the exact structured summary shape", () => {
    expect(validateContextSummary(summary, 10_000)).toEqual(summary);
  });

  it("rejects natural-language fallback and unknown fields", () => {
    expect(() => validateContextSummary({ ...summary, extra: "fallback" }, 10_000)).toThrow(
      ContextCompactionError,
    );
  });

  it("rejects summaries over the configured token budget", () => {
    expect(() => validateContextSummary(summary, 1)).toThrow("exceeds the configured token budget");
  });
});
