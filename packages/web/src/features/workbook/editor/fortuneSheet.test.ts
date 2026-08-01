import { describe, expect, it } from "vitest";
import { toFortuneSheetData } from "./fortuneSheet";

describe("toFortuneSheetData", () => {
  it("rebuilds calcChain with the real Sheet id and keeps formula syntax canonical", () => {
    const result = toFortuneSheetData({
      id: 60,
      name: "Sheet1",
      columns: [],
      uploadedData: [
        { r: 0, c: 0, v: { v: 1, m: "1" } },
        { r: 0, c: 1, v: { v: 2, m: "2", f: "SUM(A1:A1)" } },
      ],
      config: { calcChain: [{ r: 0, c: 1, id: "1" }] },
    });

    expect(result.celldata[1]?.v.f).toBe("=SUM(A1:A1)");
    expect(result.calcChain).toEqual([{ r: 0, c: 1, id: "60" }]);
  });
});
