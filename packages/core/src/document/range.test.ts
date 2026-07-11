import { describe, expect, it } from "vitest";
import { formatA1Cell, formatA1Range, parseA1Cell, parseA1Range } from "./range.js";

describe("document ranges", () => {
  it("parses and formats A1 references using zero-based coordinates internally", () => {
    expect(parseA1Cell("B3")).toEqual({ row: 2, col: 1 });
    expect(parseA1Range("B3:D5")).toEqual({
      startRow: 2,
      startCol: 1,
      endRow: 4,
      endCol: 3,
    });
    expect(formatA1Cell(2, 1)).toBe("B3");
    expect(formatA1Range({ startRow: 2, startCol: 1, endRow: 4, endCol: 3 })).toBe("B3:D5");
  });

  it("accepts absolute and sheet-qualified references", () => {
    expect(parseA1Cell("$C$4")).toEqual({ row: 3, col: 2 });
    expect(parseA1Range("Sales!A1:C2")).toEqual({
      startRow: 0,
      startCol: 0,
      endRow: 1,
      endCol: 2,
    });
  });

  it("normalizes reversed ranges", () => {
    expect(parseA1Range("D5:B3")).toEqual({
      startRow: 2,
      startCol: 1,
      endRow: 4,
      endCol: 3,
    });
  });
});
