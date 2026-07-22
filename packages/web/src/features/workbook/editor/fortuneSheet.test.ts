import { describe, expect, it } from "vitest";
import { toFortuneSheetData } from "./fortuneSheet";

describe("toFortuneSheetData", () => {
  it("uses persisted cells as-is instead of generating a metadata header", () => {
    const result = toFortuneSheetData({
      id: 1,
      name: "Sheet1",
      columns: [{ label: "Metadata header", width: 120 }],
      uploadedData: [{ r: 0, c: 0, v: { v: "Actual header", m: "Actual header" } }],
      config: null,
    });

    expect(result.celldata).toHaveLength(1);
    expect(result.celldata[0]).toMatchObject({
      r: 0,
      c: 0,
      v: { v: "Actual header", m: "Actual header" },
    });
    expect(result.columnWidths).toEqual({ 0: 120 });
  });

  it("uses black for cells without an explicit font color", () => {
    const result = toFortuneSheetData({
      id: 1,
      name: "Sheet1",
      columns: [],
      uploadedData: [{ r: 0, c: 0, v: { v: "文字", m: "文字" } }],
      config: null,
    });

    expect(result.celldata[0]?.v.fc).toBe("#000000");
  });

  it("preserves an explicitly white font color", () => {
    const result = toFortuneSheetData({
      id: 1,
      name: "Sheet1",
      columns: [],
      uploadedData: [{ r: 0, c: 0, v: { v: "文字", m: "文字", fc: "#FFFFFF" } }],
      config: null,
    });

    expect(result.celldata[0]?.v.fc).toBe("#FFFFFF");
  });

  it("uses canonical cell merge metadata instead of the legacy merge field", () => {
    const result = toFortuneSheetData({
      id: 1,
      name: "Sheet1",
      columns: [],
      uploadedData: [{ r: 0, c: 0, v: { v: "A", m: "A" } }],
      config: null,
    });

    expect(result.merges).toEqual([]);
  });
});
