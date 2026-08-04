import { excelToolSpecs } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { formatCells } from "./formatCells.js";

describe("formatCells result budget", () => {
  it("keeps the mutation summary valid when the delta is compacted", () => {
    const result = {
      success: true,
      updatedCells: 10_000,
      sheetInfo: { sheetId: 7, sheetNo: 1, sheetName: "Sheet1" },
      baseRevision: 2,
      revision: 3,
      changeSummary: {
        changedCellCount: 10_000,
        changedRanges: ["A1:A20"],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
      delta: {
        type: "format" as const,
        operations: [
          {
            type: "range" as const,
            startRow: 1,
            startCol: 1,
            endRow: 100,
            endCol: 100,
            fill: "#FFF2CC",
          },
        ],
      },
    };

    const compacted = formatCells.resultBudget.compact(result);

    expect(compacted).toMatchObject({
      success: true,
      updatedCells: 10_000,
      baseRevision: 2,
      revision: 3,
      delta: null,
      changeSummary: result.changeSummary,
      sheetInfo: result.sheetInfo,
    });
    expect(excelToolSpecs.formatCells.outputSchema.safeParse(compacted).success).toBe(true);
  });
});
