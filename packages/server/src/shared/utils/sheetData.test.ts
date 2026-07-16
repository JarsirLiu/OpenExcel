import { describe, expect, it } from "vitest";
import { sheetRecordToCelldata } from "./sheetData.js";

describe("sheetRecordToCelldata", () => {
  it("normalizes legacy cell metadata and ignores malformed cells during export", () => {
    const celldata = sheetRecordToCelldata({
      uploadedData: JSON.stringify([
        { r: 0, c: 0, v: { v: "legacy", m: "legacy", ct: { t: 123 } } },
        null,
        { r: -1, c: 1, v: { v: "invalid", m: "invalid" } },
        { r: 1, c: 0, v: { v: "valid", m: "valid" } },
      ]),
    });

    expect(celldata).toHaveLength(2);
    expect(celldata[0]?.v.ct).toBeUndefined();
    expect(celldata[1]?.v.v).toBe("valid");
  });
});
