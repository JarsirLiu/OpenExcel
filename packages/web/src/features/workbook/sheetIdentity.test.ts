import { describe, expect, it } from "vitest";
import { findSheetIndexById, normalizeSheetId } from "./sheetIdentity";

describe("sheet identity", () => {
  it("normalizes numeric and string IDs at the UI boundary", () => {
    const sheets = [{ id: 11 }, { id: 12 }];

    expect(normalizeSheetId(11)).toBe("11");
    expect(findSheetIndexById(sheets, "12")).toBe(1);
  });
});
