import { describe, expect, it, vi } from "vitest";
import { estimateTokens } from "../../session/contextWindow.js";
import { ToolResultBudget } from "./toolResultBudget.js";

describe("ToolResultBudget", () => {
  it("should use the tool-owned compactor for an oversized result", () => {
    const budget = new ToolResultBudget({
      toolPolicies: {
        readSheetData: {
          maxTokens: 30,
          compact: () => ({ mode: "range", data: [], truncated: true }),
        },
      },
    });
    const reservation = budget.reserve("readSheetData");

    const result = budget.finish(reservation, {
      mode: "range",
      data: Array.from({ length: 200 }, (_, index) => ({
        row: index + 1,
        col: 1,
        value: `value-${index}`,
      })),
    });

    expect(estimateTokens(result)).toBeLessThanOrEqual(30);
    expect(result).toEqual({ mode: "range", data: [], truncated: true });
  });

  it("should allow repeated calls without a cumulative tool budget", () => {
    const budget = new ToolResultBudget({
      toolPolicies: {
        readSheetData: { maxTokens: 10, compact: (value) => value },
        createChart: { maxTokens: 20, compact: (value) => value },
      },
    });
    const first = budget.reserve("readSheetData");
    const second = budget.reserve("readSheetData");
    const third = budget.reserve("readSheetData");
    const chart = budget.reserve("createChart");

    expect(budget.finish(first, "small")).toBe("small");
    expect(budget.finish(second, "small")).toBe("small");
    expect(budget.finish(third, "small")).toBe("small");
    expect(budget.finish(chart, "small")).toBe("small");
    expect(budget.snapshot.calls).toBe(4);
  });

  it("compacts the complete result for the model branch", () => {
    const budget = new ToolResultBudget({
      toolPolicies: {
        writeCells: { maxTokens: 10, compact: () => ({ summary: true }) },
      },
    });

    const result = budget.finish(budget.reserve("writeCells"), {
      oversized: "x".repeat(10_000),
      delta: { type: "write", operations: [{ type: "cell", row: 1, col: 1, value: "x" }] },
    });

    expect(result).toEqual({ summary: true });
  });

  it("fails loudly when a tool-owned projection still exceeds its limit", () => {
    const budget = new ToolResultBudget({
      toolPolicies: {
        readSheetData: { maxTokens: 10, compact: (value) => value },
      },
    });

    expect(() => budget.finish(budget.reserve("readSheetData"), "x".repeat(10_000))).toThrow(
      "could not produce a model result within its result budget",
    );
  });

  it("rejects a tool-owned projection that does not preserve the tool contract", () => {
    const budget = new ToolResultBudget({
      toolPolicies: {
        createChart: {
          maxTokens: 10,
          compact: () => ({ invalid: true }),
          validate: () => false,
        },
      },
    });

    expect(() => budget.finish(budget.reserve("createChart"), "x".repeat(10_000))).toThrow(
      "produced an invalid compacted result",
    );
  });
});
