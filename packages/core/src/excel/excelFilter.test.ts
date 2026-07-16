import { describe, expect, it } from "vitest";
import {
  excelAutoFilterRefToFortune,
  fortuneFilterSelectionToExcelRef,
  isFilterSelection,
} from "./excelFilter.js";

describe("excelFilter", () => {
  it("converts Excel ranges to FortuneSheet zero-based selections", () => {
    expect(excelAutoFilterRefToFortune("$A$1:$E$983")).toEqual({
      row: [0, 982],
      column: [0, 4],
    });
  });

  it("converts FortuneSheet selections back to Excel ranges", () => {
    expect(
      fortuneFilterSelectionToExcelRef({
        row: [0, 982],
        column: [0, 4],
      }),
    ).toBe("A1:E983");
  });

  it("rejects malformed and reversed ranges", () => {
    expect(excelAutoFilterRefToFortune("E983:A1")).toBeUndefined();
    expect(fortuneFilterSelectionToExcelRef({ row: [1, 0], column: [0, 1] })).toBeUndefined();
    expect(isFilterSelection({ row: [0, 1], column: [0, 1] })).toBe(true);
    expect(isFilterSelection({ row: [0, 1], column: [0] })).toBe(false);
  });
});
