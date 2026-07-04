import { describe, expect, it } from "vitest";
import { sheetChangePatchOutputSchema } from "./sheetChange.js";

describe("sheetChangePatchOutputSchema", () => {
  it("accepts a valid write patch output", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
      updatedCells: 1,
      delta: {
        type: "write",
        cells: [{ row: 1, col: 2, value: "hello" }],
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
      delta: {
        type: "write",
        cells: [{ row: 1, col: 2, value: 3, formula: "A1+B1" }],
      },
      preview: { rows: [] },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(true);
  });

  it("accepts a valid clear patch output", () => {
    const result = sheetChangePatchOutputSchema.safeParse({
      success: true,
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
      delta: {
        type: "merge",
        operations: [
          { type: "range", startRow: 2, startCol: 2, endRow: 1, endCol: 3 },
        ],
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
        cells: [{ row: 0, col: 1, value: "hello" }],
      },
      sheetInfo: { sheetId: 1, sheetName: "Sheet1" },
    });

    expect(result.success).toBe(false);
  });
});
