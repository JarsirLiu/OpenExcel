import { describe, expect, it, vi } from "vitest";
import { estimateTokens } from "../../session/contextWindow.js";
import { ToolResultBudget, wrapToolExecutorWithResultBudget } from "./toolResultBudget.js";

describe("ToolResultBudget", () => {
  it("should compact an oversized result to the reserved result budget", () => {
    const budget = new ToolResultBudget({ totalTokens: 100, maxResultTokens: 30 });
    const reservation = budget.reserve("readSheetData");

    expect("ok" in reservation).toBe(false);
    if ("ok" in reservation) return;

    const result = budget.finish(reservation, {
      mode: "range",
      data: Array.from({ length: 200 }, (_, index) => ({
        row: index + 1,
        col: 1,
        value: `value-${index}`,
      })),
    });

    expect(estimateTokens(result)).toBeLessThanOrEqual(30);
    expect(result).toHaveProperty("__truncated", true);
  });

  it("should reserve the shared budget across concurrent calls", () => {
    const budget = new ToolResultBudget({ totalTokens: 20, maxResultTokens: 10 });
    const first = budget.reserve("readSheetData");
    const second = budget.reserve("readSheetData");
    const third = budget.reserve("readSheetData");

    expect("ok" in first).toBe(false);
    expect("ok" in second).toBe(false);
    expect(third).toMatchObject({
      ok: true,
      truncated: true,
      code: "TOOL_RESULT_TRUNCATED",
    });
  });

  it("should mark only the exhausted tool as unavailable when it has a sub-budget", () => {
    const budget = new ToolResultBudget({
      totalTokens: 100,
      maxResultTokens: 10,
      toolBudgets: { readSheetData: 10 },
    });
    const reservation = budget.reserve("readSheetData");

    expect("ok" in reservation).toBe(false);
    if ("ok" in reservation) return;
    budget.finish(reservation, "x".repeat(1_000));

    expect(budget.isToolExhausted("readSheetData")).toBe(true);
    expect(budget.isToolExhausted("writeCells")).toBe(false);
  });

  it("applies the result budget at the ToolExecutor boundary", async () => {
    const executor = vi.fn().mockResolvedValue("x".repeat(10_000));
    const budget = new ToolResultBudget({ totalTokens: 20, maxResultTokens: 10 });
    const wrapped = wrapToolExecutorWithResultBudget({ execute: executor }, budget);

    const result = await wrapped.execute({
      toolName: "readSheetData",
      toolCallId: "call-1",
      input: {},
      context: {},
    });

    expect(executor).toHaveBeenCalledOnce();
    expect(typeof result).toBe("string");
    expect(estimateTokens(result)).toBeLessThanOrEqual(10);
  });
});
