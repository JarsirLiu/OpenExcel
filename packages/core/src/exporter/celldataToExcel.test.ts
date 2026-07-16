import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { celldataToExcel } from "./celldataToExcel.js";

describe("celldataToExcel", () => {
  it("restores persisted view and nested FortuneSheet layout config", async () => {
    const buffer = await celldataToExcel([
      {
        name: "Sheet1",
        celldata: [
          { r: 0, c: 0, v: { v: "店铺", m: "店铺", fc: "#000000" } },
          { r: 1, c: 0, v: { v: "0.18", m: "0.18", ct: { t: "n", fa: "General" } } },
        ],
        config: {
          luckysheet_select_save: [{ row: [28, 28], column: [7, 7] }],
          config: { columnlen: { 0: 219 } },
        },
      },
    ]);

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet("Sheet1");

    expect(worksheet).toBeDefined();
    expect(worksheet?.views[0]?.activeCell).toBe("H29");
    expect(worksheet?.getColumn(1).width).toBeCloseTo(219 / 7);
    expect(worksheet?.getCell("A2").value).toBe(0.18);
  });
});
