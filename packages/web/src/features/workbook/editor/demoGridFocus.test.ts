import { describe, expect, it } from "vitest";
import { parseDemoGridRange } from "./demoGridFocus";

describe("demoGridFocus", () => {
  describe("parseDemoGridRange", () => {
    it("parses single and multi-letter A1 ranges into zero-based coordinates", () => {
      expect(parseDemoGridRange("B2:AA18")).toEqual({
        row: [1, 17],
        column: [1, 26],
      });
      expect(parseDemoGridRange("$C$7")).toEqual({
        row: [6, 6],
        column: [2, 2],
      });
    });

    it("normalizes reversed ranges and rejects invalid references", () => {
      expect(parseDemoGridRange("D9:B3")).toEqual({
        row: [2, 8],
        column: [1, 3],
      });
      expect(parseDemoGridRange("not-a-range")).toBeNull();
    });
  });
});
