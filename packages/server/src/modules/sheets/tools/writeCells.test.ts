import { excelToolSpecs } from "@openexcel/core";
import { describe, expect, it } from "vitest";
import { writeCells } from "./writeCells.js";

describe("writeCells result budget", () => {
  it("keeps the bounded summary valid while removing oversized projections", () => {
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
        type: "write" as const,
        operations: [
          {
            type: "range" as const,
            startRow: 1,
            startCol: 1,
            endRow: 100,
            endCol: 100,
            value: "x",
          },
        ],
      },
      preview: { rows: [{ row: 1, values: Array.from({ length: 32 }, () => "x") }] },
    };

    const compacted = writeCells.resultBudget.compact(result);

    expect(compacted).toMatchObject({
      success: true,
      updatedCells: 10_000,
      baseRevision: 2,
      revision: 3,
      delta: null,
      changeSummary: result.changeSummary,
      sheetInfo: result.sheetInfo,
    });
    expect(compacted).not.toHaveProperty("preview");
    expect(excelToolSpecs.writeCells.outputSchema.safeParse(compacted).success).toBe(true);
  });
});
