import { describe, expect, it } from "vitest";
import { toWorkbook } from "./replayWorkbookProjection";

describe("toWorkbook", () => {
  it("keeps formula cells numeric while applying their display precision", () => {
    const workbook = toWorkbook(
      {
        name: "Demo",
        publicId: "demo",
        sheets: [
          {
            name: "Sheet1",
            columns: ["利润"],
            rows: [[{ value: 1.2200000000000002, formula: "=G12-D12", numberFormat: "0.00" }]],
          },
        ],
      },
      0,
    );

    expect(workbook.sheets[0].uploadedData?.[0]).toMatchObject({
      v: {
        v: 1.2200000000000002,
        m: "1.22",
        f: "G12-D12",
        ct: { fa: "0.00", t: "n" },
      },
    });
  });

  it("formats grouped numbers and percentages in demo cells", () => {
    const workbook = toWorkbook(
      {
        name: "Demo",
        publicId: "demo",
        sheets: [
          {
            name: "Sheet1",
            columns: ["金额", "比例"],
            rows: [
              [
                { value: 1234.5, numberFormat: "#,##0.00" },
                { value: 0.125, numberFormat: "0.0%" },
              ],
            ],
          },
        ],
      },
      0,
    );

    expect(workbook.sheets[0].uploadedData).toEqual([
      expect.objectContaining({ v: expect.objectContaining({ m: "1,234.50" }) }),
      expect.objectContaining({ v: expect.objectContaining({ m: "12.5%" }) }),
    ]);
  });
});
