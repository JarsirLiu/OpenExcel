import { describe, expect, it, vi } from "vitest";
import { estimateTokens } from "../../session/contextWindow.js";
import { ToolResultBudget, wrapToolSetWithResultBudget } from "./toolResultBudget.js";

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

  it("should return a normal truncated result without executing after exhaustion", async () => {
    const execute = vi.fn(async (_input?: unknown, _options?: unknown) => ({
      data: Array.from({ length: 100 }, () => "large result"),
    }));
    const budget = new ToolResultBudget({ totalTokens: 8, maxResultTokens: 8 });
    const tools = wrapToolSetWithResultBudget(
      { readSheetData: { description: "read", execute } },
      budget,
    );

    for (;;) {
      const reservation = budget.reserve("readSheetData");
      if ("ok" in reservation) break;
      budget.finish(reservation, "x".repeat(1_000));
    }
    const result = await tools.readSheetData.execute?.({}, {});

    expect(execute).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      ok: true,
      truncated: true,
      code: "TOOL_RESULT_TRUNCATED",
    });
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

  it("passes a structured result budget to paged tools", async () => {
    const execute = vi.fn(async (_input?: unknown, options?: any) => ({
      range: "A1:B2",
      values: [
        ["row-1", 1],
        ["row-2", 2],
      ],
      continuation: null,
      budget: options?.resultBudget,
    }));
    const budget = new ToolResultBudget({
      totalTokens: 100,
      maxResultTokens: 100,
      toolPolicies: { readSheetData: { kind: "paged-structured" } },
    });
    const tools = wrapToolSetWithResultBudget({ readSheetData: { execute } }, budget);

    const result = await tools.readSheetData.execute?.({}, {});

    expect(execute).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        resultBudget: { maxTokens: 100, policy: "paged-structured" },
      }),
    );
    expect(result).toMatchObject({
      values: [
        ["row-1", 1],
        ["row-2", 2],
      ],
    });
  });
});
