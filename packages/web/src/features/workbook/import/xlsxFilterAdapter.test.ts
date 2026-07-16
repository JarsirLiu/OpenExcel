import { describe, expect, it } from "vitest";
import XLSX from "xlsx-js-style";
import { extractXlsxFilterSelections } from "./xlsxFilterAdapter";

describe("xlsxFilterAdapter", () => {
  it("extracts worksheet auto-filter ranges without parsing cell styles", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["门店", "商品"],
      ["001", "商品 A"],
    ]);
    worksheet["!autofilter"] = { ref: "A1:B2" };
    XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
    const data = XLSX.write(workbook, { bookType: "xlsx", type: "array" });

    await expect(extractXlsxFilterSelections(new File([data], "表1.xlsx"))).resolves.toEqual({
      Sheet1: { row: [0, 1], column: [0, 1] },
    });
  });
});
