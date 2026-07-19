import { describe, expect, it } from "vitest";
import { toolIndex } from "./sheetCoordinates.js";
import {
  fortuneMergesToToolRanges,
  toolCellToA1Ref,
  toolColumnToA1Ref,
  toolRangeToA1Ref,
} from "./sheetGeometry.js";

describe("sheet geometry conversions", () => {
  it("converts FortuneSheet merges and tool ranges at the core boundary", () => {
    expect(
      fortuneMergesToToolRanges([
        { r: 0, c: 0, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
        { r: 0, c: 1, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
        { r: 0, c: 2, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
        { r: 1, c: 0, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
        { r: 1, c: 1, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
        { r: 1, c: 2, v: { v: "", m: "", mc: { r: 0, c: 0, rs: 2, cs: 3 } } },
      ]),
    ).toEqual([{ startRow: 1, startCol: 1, endRow: 2, endCol: 3 }]);
    expect(toolColumnToA1Ref(toolIndex(27))).toBe("AA");
    expect(toolCellToA1Ref(toolIndex(2), toolIndex(27))).toBe("AA2");
    expect(
      toolRangeToA1Ref({
        startRow: toolIndex(1),
        startCol: toolIndex(1),
        endRow: toolIndex(2),
        endCol: toolIndex(3),
      }),
    ).toBe("A1:C2");
  });

  it("rejects malformed merge spans at the core boundary", () => {
    expect(() =>
      fortuneMergesToToolRanges([{ r: 0, c: 0, v: { mc: { r: 0, c: 0, rs: 0, cs: 1 } } } as any]),
    ).toThrow("positive");
  });
});
