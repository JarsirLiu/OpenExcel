import { describe, expect, it } from "vitest";
import XLSX from "xlsx-js-style";
import { transformSheetJsFileToFortuneSheets } from "./sheetJsAdapter";
import { toFortuneValue } from "./sheetJsStyles";

describe("sheetJsAdapter", () => {
  it("parses quoted CSV fields without splitting embedded commas", async () => {
    const file = new File(['名称,备注\n商品 A,"含有,逗号"\n商品 B,"第一行\n第二行"'], "数据.csv", {
      type: "text/csv",
    });

    const [sheet] = await transformSheetJsFileToFortuneSheets(file);

    expect(sheet?.name).toBe("Sheet1");
    expect(sheet?.celldata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ r: 1, c: 1, v: expect.objectContaining({ v: "含有,逗号" }) }),
        expect.objectContaining({
          r: 2,
          c: 1,
          v: expect.objectContaining({ v: "第一行\n第二行" }),
        }),
      ]),
    );
  });

  it("reads legacy XLS workbooks through SheetJS", async () => {
    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["名称", "数量"],
      ["商品 A", 3],
    ]);
    worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
    XLSX.utils.book_append_sheet(workbook, worksheet, "库存");
    const data = XLSX.write(workbook, { bookType: "xls", type: "array" });

    const [sheet] = await transformSheetJsFileToFortuneSheets(new File([data], "库存.xls"));

    expect(sheet?.name).toBe("库存");
    expect(sheet?.celldata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          r: 0,
          c: 0,
          v: expect.objectContaining({ mc: { r: 0, c: 0, rs: 1, cs: 2 } }),
        }),
        expect.objectContaining({ r: 1, c: 1, v: expect.objectContaining({ v: 3 }) }),
      ]),
    );
  });

  it("preserves indexed and themed colors from cell styles", () => {
    const value = toFortuneValue({
      t: "s",
      v: "颜色",
      s: {
        font: { color: { indexed: 2 } },
        fill: { fgColor: { theme: 4, tint: 0.2 } },
      },
    });

    expect(value.fc).toBe("#FF0000");
    expect(value.bg).toBe("#729ACA");
  });
});
