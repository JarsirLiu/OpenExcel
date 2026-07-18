import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx-js-style";
import type { ChartSpec } from "../chart/chartModel.js";
import { workbookToXlsx } from "../exporter/xlsxWorkbookExporter.js";
import { parseSpreadsheetFile } from "./spreadsheetFileImporter.js";
import { parseXlsxCharts } from "./xlsxChartImporter.js";
import {
  assertXlsxContainerSafe,
  XlsxContainerError,
  XlsxSafetyLimitError,
} from "./xlsxSafetyGuard.js";

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

async function chartXlsxBytes(): Promise<ArrayBuffer> {
  const chart: ChartSpec = {
    id: "chart-1",
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    type: "line",
    title: "销售趋势",
    anchor: {
      kind: "twoCell",
      from: { row: 1, col: 3 },
      to: { row: 12, col: 10 },
    },
    series: [
      {
        id: "series-1",
        name: "销售额",
        categoryRef: {
          sheetId: "sheet-1",
          start: { row: 0, col: 0 },
          end: { row: 2, col: 0 },
        },
        valueRef: {
          sheetId: "sheet-1",
          start: { row: 0, col: 1 },
          end: { row: 2, col: 1 },
        },
      },
    ],
  };
  return workbookToXlsx({
    workbookId: "workbook-1",
    sheets: [
      {
        id: "sheet-1",
        name: "销售明细",
        celldata: [
          { r: 0, c: 0, v: { v: "一月", m: "一月" } },
          { r: 0, c: 1, v: { v: 12, m: "12" } },
          { r: 1, c: 0, v: { v: "二月", m: "二月" } },
          { r: 1, c: 1, v: { v: 18, m: "18" } },
          { r: 2, c: 0, v: { v: "三月", m: "三月" } },
          { r: 2, c: 1, v: { v: 21, m: "21" } },
        ],
      },
    ],
    charts: [chart],
  });
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

  it("imports charts from the XLSX drawing and chart parts", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "销售.xlsx",
      format: "xlsx",
      bytes: await chartXlsxBytes(),
    });

    expect(result.charts).toHaveLength(1);
    expect(result.charts[0]).toMatchObject({
      type: "line",
      title: "销售趋势",
      sheetKey: "sheet-0",
      anchor: {
        kind: "twoCell",
        from: { row: 1, col: 3 },
        to: { row: 12, col: 10 },
      },
      series: [
        {
          name: "销售额",
          categoryRef: {
            sheetKey: "sheet-0",
            start: { row: 0, col: 0 },
            end: { row: 2, col: 0 },
          },
          valueRef: {
            sheetKey: "sheet-0",
            start: { row: 0, col: 1 },
            end: { row: 2, col: 1 },
          },
        },
      ],
    });
  });

  it("enforces chart limits while reading the XLSX package", async () => {
    await expect(
      parseXlsxCharts(await chartXlsxBytes(), {
        maxChartsPerWorkbook: 0,
        maxSeriesPerChart: 100,
        maxTotalSeries: 10_000,
      }),
    ).rejects.toThrow("图表数量超过安全限制");
  });

  it("rejects chart presentation that is not represented by ChartSpec", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace("<c:plotArea>", '<c:legend><c:legendPos val="b"/></c:legend><c:plotArea>'),
    );

    await expect(
      parseSpreadsheetFile({
        fileName: "带图例.xlsx",
        format: "xlsx",
        bytes: await zip.generateAsync({ type: "arraybuffer" }),
      }),
    ).rejects.toThrow("尚未建模的展示属性");
  });

  it.each([
    "stacked",
    "percentStacked",
  ] as const)("rejects %s charts that cannot round-trip through ChartSpec", async (grouping) => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace('<c:grouping val="standard"/>', `<c:grouping val="${grouping}"/>`),
    );

    await expect(
      parseSpreadsheetFile({
        fileName: "堆叠图.xlsx",
        format: "xlsx",
        bytes: await zip.generateAsync({ type: "arraybuffer" }),
      }),
    ).rejects.toThrow("图表分组方式");
  });

  it("rejects chart titles linked to cells instead of flattening their formula", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace(
        /<c:title>[\s\S]*?<\/c:title>/,
        '<c:title><c:tx><c:strRef><c:f>\'销售明细\'!$A$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>销售趋势</c:v></c:pt></c:strCache></c:strRef></c:tx></c:title>',
      ),
    );

    await expect(
      parseSpreadsheetFile({
        fileName: "动态标题.xlsx",
        format: "xlsx",
        bytes: await zip.generateAsync({ type: "arraybuffer" }),
      }),
    ).rejects.toThrow("引用单元格的 XLSX 图表标题");
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

describe("assertXlsxContainerSafe", () => {
  it("rejects a workbook with too many ZIP entries before parsing", async () => {
    const zip = new JSZip();
    for (let index = 0; index < 3; index += 1) {
      zip.file(`xl/worksheets/sheet${index}.xml`, "<worksheet />");
    }
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      assertXlsxContainerSafe(bytes, {
        maxZipEntries: 2,
        maxEntryUncompressedBytes: 1024,
        maxTotalUncompressedBytes: 4096,
      }),
    ).rejects.toBeInstanceOf(XlsxSafetyLimitError);
  });

  it("rejects a ZIP whose declared uncompressed size exceeds the limit", async () => {
    const zip = new JSZip();
    zip.file("xl/worksheets/sheet1.xml", "x".repeat(32));
    const bytes = await zip.generateAsync({ type: "uint8array" });

    await expect(
      assertXlsxContainerSafe(bytes, {
        maxZipEntries: 10,
        maxEntryUncompressedBytes: 8,
        maxTotalUncompressedBytes: 64,
      }),
    ).rejects.toBeInstanceOf(XlsxSafetyLimitError);
  });

  it("rejects a malformed ZIP as an invalid container", async () => {
    await expect(assertXlsxContainerSafe(new Uint8Array([0x50, 0x4b]))).rejects.toBeInstanceOf(
      XlsxContainerError,
    );
  });
});
