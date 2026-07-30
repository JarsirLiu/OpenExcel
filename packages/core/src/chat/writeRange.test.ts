import { describe, expect, it } from "vitest";
import { formatWriteRange, parseWriteRange, writeRangeCellCount } from "./writeRange.js";

describe("write range", () => {
  it("parses and formats A1 ranges independently of read range parsing", () => {
    const range = parseWriteRange("$B$2:D4");

    expect(range).toEqual({ startRow: 2, startCol: 2, endRow: 4, endCol: 4 });
    expect(formatWriteRange(range)).toBe("B2:D4");
    expect(writeRangeCellCount(range)).toBe(9);
  });

  it("rejects reversed and out-of-sheet ranges", () => {
    expect(() => parseWriteRange("D4:B2")).toThrow();
    expect(() => parseWriteRange("XFE1")).toThrow();
    expect(() => parseWriteRange("A1048577")).toThrow();
  });
});
