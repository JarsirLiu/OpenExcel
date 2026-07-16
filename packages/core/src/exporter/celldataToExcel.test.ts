import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { celldataToExcel } from "./celldataToExcel.js";

describe("celldataToExcel", () => {
  it("restores persisted view and nested FortuneSheet layout config", async () => {
    const buffer = await celldataToExcel([
      {
        name: "Sheet1",
        celldata: [
          {
            r: 0,
            c: 0,
            v: {
              v: "店铺",
              m: "店铺",
              fc: "#80112233",
              ht: 0,
              vt: 1,
              tb: "1",
              bd: { t: { s: 8, c: "#112233" } },
            },
          },
          { r: 1, c: 0, v: { v: "0.18", m: "0.18", ct: { t: "n", fa: "General" } } },
          { r: 1, c: 1, v: { v: 3, m: "3", f: "=A2*2", ct: { t: "n" } } },
        ],
        config: {
          luckysheet_select_save: [{ row: [28, 28], column: [7, 7] }],
          filter_select: { row: [0, 2], column: [0, 4] },
          config: { columnlen: { 0: 219 } },
          borderInfo: [
            {
              rangeType: "cell",
              value: { row_index: 0, col_index: 1, t: { style: 8, color: "#445566" } },
            },
          ],
        },
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet("Sheet1");

    expect(worksheet).toBeDefined();
    expect(worksheet?.views[0]?.activeCell).toBe("H29");
    expect(worksheet?.autoFilter).toBe("A1:E3");
    expect(worksheet?.getColumn(1).width).toBeCloseTo(219 / 7);
    expect(worksheet?.getCell("A1").alignment).toMatchObject({
      horizontal: "center",
      vertical: "top",
    });
    expect(worksheet?.getCell("A1").alignment.wrapText).not.toBe(true);
    expect(worksheet?.getCell("A1").font?.color).toEqual({ argb: "80112233" });
    expect(worksheet?.getCell("A1").border?.top).toMatchObject({
      style: "medium",
      color: { argb: "FF112233" },
    });
    expect(worksheet?.getCell("B1").border?.top).toMatchObject({
      style: "medium",
      color: { argb: "FF445566" },
    });
    expect(worksheet?.getCell("A2").value).toBe(0.18);
    expect(worksheet?.getCell("B2").value).toEqual({ formula: "A2*2", result: 3 });
  });
});
