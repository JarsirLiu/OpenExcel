import { describe, expect, it } from "vitest";
import { sheetChangePatchOutputSchema } from "./sheetChange.js";

describe("sheetChangePatchOutputSchema", () => {
  it("accepts a valid write patch output", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      updatedCells: 1,
      changeSummary: {
        changedCellCount: 1,
        changedRanges: ["B1"],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
      delta: {
        type: "write",
        operations: [
          { type: "range", startRow: 1, startCol: 2, endRow: 1, endCol: 2, value: "hello" },
        ],
      },
      preview: { rows: [] },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a write patch output with formulas", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      updatedCells: 1,
      changeSummary: {
        changedCellCount: 1,
        changedRanges: ["B1"],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
      delta: {
        type: "write",
        operations: [
          {
            type: "range",
            startRow: 1,
            startCol: 2,
            endRow: 1,
            endCol: 2,
            value: 3,
            formula: "A1+B1",
          },
        ],
      },
      preview: { rows: [] },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a compact ordered range write patch", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      updatedCells: 4,
      changeSummary: {
        changedCellCount: 4,
        changedRanges: ["A2:B3"],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 2,
      },
      delta: {
        type: "write",
        operations: [
          { type: "range", startRow: 2, startCol: 1, endRow: 2, endCol: 2, value: "value" },
          { type: "range", startRow: 3, startCol: 1, endRow: 3, endCol: 2, value: "override" },
        ],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a write patch output with no actual cell changes", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      updatedCells: 0,
      changeSummary: {
        changedCellCount: 0,
        changedRanges: [],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 0,
      },
      delta: {
        type: "write",
        operations: [{ type: "range", startRow: 1, startCol: 1, endRow: 1, endCol: 1, value: "x" }],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid clear patch output", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      changeSummary: {
        changedCellCount: 0,
        changedRanges: [],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
      delta: {
        type: "clear",
        operations: [
          { type: "cell", row: 1, col: 2 },
          { type: "range", startRow: 3, startCol: 4, endRow: 5, endCol: 6 },
        ],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("rejects invalid ranges", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      changeSummary: {
        changedCellCount: 0,
        changedRanges: [],
        omittedRangeCount: 0,
        truncated: false,
        operationCount: 1,
      },
      delta: {
        type: "merge",
        operations: [{ type: "range", startRow: 2, startCol: 2, endRow: 1, endCol: 3 }],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(false);
  });

  it("rejects zero-based coordinates", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      delta: {
        type: "write",
        operations: [
          { type: "range", startRow: 0, startCol: 2, endRow: 0, endCol: 2, value: "hello" },
        ],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(false);
  });
});
