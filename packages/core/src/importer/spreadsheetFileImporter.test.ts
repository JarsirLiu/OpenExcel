import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx-js-style";
import { parseSpreadsheetFile } from "./spreadsheetFileImporter.js";

function workbookBytes(bookType: "xlsx" | "xls"): Uint8Array {
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["名称", "数量"],
    ["商品 A", 3],
  ]);
  worksheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 1 } }];
  worksheet["!autofilter"] = { ref: "A1:B2" };
  XLSX.utils.book_append_sheet(workbook, worksheet, "库存");
  return XLSX.write(workbook, { bookType, type: "array" });
}

async function styledXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("库存");
  worksheet.getCell("A1").value = "名称";
  worksheet.getCell("A1").font = { bold: true, color: { argb: "FFFF0000" } };
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };
  worksheet.getCell("A2").value = "商品 A";
  worksheet.getCell("B2").value = 3;
  worksheet.getCell("B2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { indexed: 4 } as never,
  };
  worksheet.mergeCells("A1:B1");
  worksheet.autoFilter = "A1:B2";
  return workbook.xlsx.writeBuffer();
}

async function configuredXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("配置");
  worksheet.getCell("A1").value = "带图片的工作表";
  worksheet.getColumn(1).width = 24;
  worksheet.getRow(1).height = 28;
  const imageId = workbook.addImage({
    base64:
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
    extension: "png",
  });
  worksheet.addImage(imageId, { tl: { col: 1, row: 1 }, ext: { width: 20, height: 20 } });
  return workbook.xlsx.writeBuffer();
}

describe("parseSpreadsheetFile", () => {
  it("parses CSV bytes into the shared import model", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "数据.csv",
      format: "csv",
      bytes: new TextEncoder().encode('名称,备注\n商品 A,"含有,逗号"'),
    });

    expect(result.name).toBe("数据");
    expect(result.sheets).toHaveLength(1);
    expect(result.sheets[0]?.celldata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ r: 1, c: 1, v: expect.objectContaining({ v: "含有,逗号" }) }),
      ]),
    );
  });

  it.each(["xlsx", "xls"] as const)("parses %s workbook structure", async (format) => {
    const result = await parseSpreadsheetFile({
      fileName: `库存.${format}`,
      format,
      bytes: format === "xlsx" ? await styledXlsxBytes() : workbookBytes(format),
    });
    const sheet = result.sheets[0];

    expect(result.name).toBe("库存");
    expect(sheet?.name).toBe("库存");
    expect(sheet?.merges).toEqual([{ row: [0, 0], col: [0, 1] }]);
    if (format === "xlsx") {
      expect(sheet?.config.filter_select).toEqual({ row: [0, 1], column: [0, 1] });
    }
    expect(sheet?.celldata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ r: 1, c: 1, v: expect.objectContaining({ v: 3 }) }),
        expect.objectContaining({
          r: 0,
          c: 0,
          v: expect.objectContaining({ mc: { r: 0, c: 0, rs: 1, cs: 2 } }),
        }),
      ]),
    );
    if (format === "xlsx") {
      expect(sheet?.celldata).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            r: 0,
            c: 0,
            v: expect.objectContaining({ bg: "#FFFF00", fc: "#FF0000", bl: 1 }),
          }),
          expect.objectContaining({
            r: 1,
            c: 1,
            v: expect.objectContaining({ bg: "#0000FF" }),
          }),
        ]),
      );
    }
  });

  it("rejects invalid workbook bytes", async () => {
    await expect(
      parseSpreadsheetFile({
        fileName: "损坏.xlsx",
        format: "xlsx",
        bytes: new Uint8Array([0x50, 0x4b]),
      }),
    ).rejects.toThrow();
  });

  it("normalizes FortuneExcel class instances for Node-side persistence", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "配置.xlsx",
      format: "xlsx",
      bytes: await configuredXlsxBytes(),
    });
    const sheet = result.sheets[0];

    expect(() => JSON.stringify(sheet?.config)).not.toThrow();
    expect(sheet?.config.config).toEqual(
      expect.objectContaining({ columnlen: expect.any(Object), rowlen: expect.any(Object) }),
    );
  });

  it("supports FortuneExcel's Node runtime when an XLSX contains images", async () => {
    const bytes = await readFile(
      new URL(
        "../../node_modules/@corbe30/fortune-excel/test/fixtures/xls_preview.xlsx",
        import.meta.url,
      ),
    );
    const result = await parseSpreadsheetFile({
      fileName: "图片.xlsx",
      format: "xlsx",
      bytes,
    });

    expect(result.sheets[0]?.config.images).toHaveLength(1);
  });
});
