import { describe, expect, it } from "vitest";
import { getSheetIndexAfterDeletion, normalizeSheetIndex } from "./sheetIndex";

describe("sheet index helpers", () => {
  it("normalizes invalid and out-of-range indexes", () => {
    expect(normalizeSheetIndex(Number.NaN, 3)).toBe(0);
    expect(normalizeSheetIndex(9, 3)).toBe(2);
    expect(normalizeSheetIndex(-1, 3)).toBe(0);
    expect(normalizeSheetIndex(1.8, 3)).toBe(1);
  });

  it("selects the next sheet or the previous last sheet after deletion", () => {
    expect(getSheetIndexAfterDeletion(1, 2)).toBe(1);
    expect(getSheetIndexAfterDeletion(2, 2)).toBe(1);
    expect(getSheetIndexAfterDeletion(0, 0)).toBe(0);
  });
});
