import { readFile } from "node:fs/promises";
import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import XLSX from "xlsx-js-style";
import type { ChartSpec } from "../chart/chartModel.js";
import { workbookToXlsx } from "../exporter/xlsxWorkbookExporter.js";
import { normalizeSheetJsStyle } from "./sheetJsStyle.js";
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

async function customThemeXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("主题色");
  worksheet.getCell("A1").value = "自定义主题";
  worksheet.getCell("A1").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { theme: 4 } as never,
  };
  worksheet.getCell("A1").font = { color: { theme: 5 } as never };
  worksheet.getCell("A2").value = "主题色加亮";
  worksheet.getCell("A2").fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { theme: 4, tint: 0.2 } as never,
  };
  worksheet.getCell("A3").value = "主题色变暗";
  worksheet.getCell("A3").font = { color: { theme: 5, tint: -0.2 } as never };

  const bytes = await workbook.xlsx.writeBuffer();
  const zip = await JSZip.loadAsync(bytes);
  zip.file(
    "xl/theme/theme1.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Custom">
  <a:themeElements>
    <a:clrScheme name="Custom">
      <a:dk1><a:srgbClr val="000000"/></a:dk1>
      <a:lt1><a:srgbClr val="FFFFFF"/></a:lt1>
      <a:dk2><a:srgbClr val="111111"/></a:dk2>
      <a:lt2><a:srgbClr val="EEEEEE"/></a:lt2>
      <a:accent1><a:srgbClr val="123456"/></a:accent1>
      <a:accent2><a:srgbClr val="654321"/></a:accent2>
      <a:accent3><a:srgbClr val="ABCDEF"/></a:accent3>
      <a:accent4><a:srgbClr val="FEDCBA"/></a:accent4>
      <a:accent5><a:srgbClr val="135790"/></a:accent5>
      <a:accent6><a:srgbClr val="975310"/></a:accent6>
      <a:hlink><a:srgbClr val="0000FF"/></a:hlink>
      <a:folHlink><a:srgbClr val="800080"/></a:folHlink>
    </a:clrScheme>
  </a:themeElements>
</a:theme>`,
  );
  return zip.generateAsync({ type: "arraybuffer" });
}

async function datedXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("日期");
  worksheet.getCell("A1").value = "日期";
  worksheet.getCell("A2").value = new Date(Date.UTC(2024, 0, 1));
  worksheet.getCell("A2").numFmt = "yyyy-mm-dd";
  worksheet.getCell("B1").value = "时间";
  worksheet.getCell("B2").value = new Date(Date.UTC(2024, 0, 1, 12, 30));
  worksheet.getCell("B2").numFmt = "yyyy-mm-dd hh:mm";
  worksheet.getCell("C1").value = "数字";
  worksheet.getCell("C2").value = 45292;
  worksheet.getCell("D1").value = new Date(Date.UTC(2022, 8, 1));
  worksheet.getCell("D1").numFmt = "m/d/yy";
  return workbook.xlsx.writeBuffer();
}

async function formattedXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("格式");
  worksheet.getCell("A1").value = 1234.5;
  worksheet.getCell("A1").numFmt = "$#,##0.00";
  worksheet.getCell("A2").value = 0.125;
  worksheet.getCell("A2").numFmt = "0.0%";
  worksheet.getCell("A3").value = 1234567.89;
  worksheet.getCell("A3").numFmt = "#,##0.00";
  worksheet.getCell("A4").value = { formula: "1+1", result: 2 };
  worksheet.getCell("A4").numFmt = "0.00";
  worksheet.getCell("A5").value = true;
  worksheet.getCell("A6").value = false;
  worksheet.getCell("A7").value = { error: "#DIV/0!" };
  worksheet.getCell("A8").value = {
    richText: [{ text: "粗体", font: { bold: true } }, { text: "普通" }],
  };
  return workbook.xlsx.writeBuffer();
}

async function configuredXlsxBytes(): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("配置");
  worksheet.getCell("A1").value = "带图片的工作表";
  worksheet.getCell("A1").border = {
    top: { style: "thin" },
    bottom: { style: "thin" },
    left: { style: "thin" },
    right: { style: "thin" },
  };
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

async function chartXlsxBytes(type: "line" | "doughnut" | "radar" = "line"): Promise<ArrayBuffer> {
  const chart: ChartSpec = {
    id: "chart-1",
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    type,
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

async function drawingWithoutRelationshipsXlsxBytes(): Promise<Uint8Array> {
  const zip = new JSZip();
  zip.file(
    "xl/workbook.xml",
    '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="数据" sheetId="1" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file(
    "xl/worksheets/sheet1.xml",
    '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheetData/><drawing r:id="rId1"/></worksheet>',
  );
  zip.file(
    "xl/worksheets/_rels/sheet1.xml.rels",
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>',
  );
  zip.file(
    "xl/drawings/drawing1.xml",
    '<?xml version="1.0"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing"><xdr:twoCellAnchor><xdr:from/><xdr:to/><xdr:cxnSp><xdr:nvCxnSpPr/><xdr:spPr/></xdr:cxnSp></xdr:twoCellAnchor></xdr:wsDr>',
  );
  return zip.generateAsync({ type: "uint8array" });
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

  it("resolves custom theme colors before storing cell styles", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "主题色.xlsx",
      format: "xlsx",
      bytes: await customThemeXlsxBytes(),
    });

    expect(result.sheets[0]?.celldata).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          r: 0,
          c: 0,
          v: expect.objectContaining({ bg: "#123456", fc: "#654321" }),
        }),
        expect.objectContaining({
          r: 1,
          c: 0,
          v: expect.objectContaining({ bg: "#205d99" }),
        }),
        expect.objectContaining({
          r: 2,
          c: 0,
          v: expect.objectContaining({ fc: "#51361a" }),
        }),
      ]),
    );
  });

  it("normalizes the BIFF style shape returned by xlsx-js-style", () => {
    expect(
      normalizeSheetJsStyle({
        patternType: "solid",
        fgColor: { rgb: "00CCFF" },
        bgColor: { rgb: "FFFFFF" },
      }),
    ).toEqual({ fill: { fgColor: { rgb: "00CCFF" } } });
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
    expect(sheet?.config.config).toEqual(
      expect.objectContaining({
        borderInfo: expect.arrayContaining([
          expect.objectContaining({
            rangeType: "cell",
            value: expect.objectContaining({
              row_index: 0,
              col_index: 0,
              t: expect.objectContaining({ style: expect.any(Number) }),
              b: expect.objectContaining({ style: expect.any(Number) }),
              l: expect.objectContaining({ style: expect.any(Number) }),
              r: expect.objectContaining({ style: expect.any(Number) }),
            }),
          }),
        ]),
      }),
    );
  });

  it("formats Excel date serials for display without changing their numeric values", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "日期.xlsx",
      format: "xlsx",
      bytes: await datedXlsxBytes(),
    });
    const cells = new Map(result.sheets[0]?.celldata.map((cell) => [`${cell.r}:${cell.c}`, cell]));

    expect(cells.get("1:0")?.v).toMatchObject({
      v: 45292,
      m: "2024-01-01",
      ct: { fa: "yyyy-mm-dd", t: "d" },
    });
    expect(cells.get("1:1")?.v).toMatchObject({
      v: 45292.52083333333,
      m: "2024-01-01 12:30",
      ct: { t: "d" },
    });
    expect(cells.get("1:2")?.v).toMatchObject({ v: 45292, m: "45292" });
    expect(cells.get("0:3")?.v).toMatchObject({
      v: 44805,
      m: "2022/9/1",
      ct: { fa: "m/d/yy", t: "d" },
    });
  });

  it("preserves Excel display formats and scalar types", async () => {
    const result = await parseSpreadsheetFile({
      fileName: "格式.xlsx",
      format: "xlsx",
      bytes: await formattedXlsxBytes(),
    });
    const cells = new Map(result.sheets[0]?.celldata.map((cell) => [cell.r, cell.v]));

    expect(cells.get(0)).toMatchObject({ v: 1234.5, m: "$1,234.50" });
    expect(cells.get(1)).toMatchObject({ v: 0.125, m: "12.5%" });
    expect(cells.get(2)).toMatchObject({ v: 1234567.89, m: "1,234,567.89" });
    expect(cells.get(3)).toMatchObject({ v: 2, m: "2.00", f: "=1+1" });
    expect(cells.get(4)).toMatchObject({ v: true, m: "TRUE", ct: { t: "b" } });
    expect(cells.get(5)).toMatchObject({ v: false, m: "FALSE", ct: { t: "b" } });
    expect(cells.get(6)).toMatchObject({ v: "#DIV/0!", m: "#DIV/0!", ct: { t: "e" } });
    expect(cells.get(7)).toMatchObject({ v: "粗体普通", m: "粗体普通" });
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

  it.each(["doughnut", "radar"] as const)("imports %s charts from generated XLSX", async (type) => {
    const result = await parseSpreadsheetFile({
      fileName: `${type}.xlsx`,
      format: "xlsx",
      bytes: await chartXlsxBytes(type),
    });

    expect(result.charts).toHaveLength(1);
    expect(result.charts[0]?.type).toBe(type);
    expect(result.charts[0]?.series[0]).not.toHaveProperty("valueRef.sheetId");
    expect(result.charts[0]?.series[0]?.valueRef.sheetKey).toBe("sheet-0");
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

  it("ignores a non-chart drawing without a relationships part", async () => {
    const result = await parseXlsxCharts(await drawingWithoutRelationshipsXlsxBytes());

    expect(result.charts).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("skips chart presentation that is not represented by ChartSpec", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace("<c:plotArea>", '<c:legend><c:legendPos val="b"/></c:legend><c:plotArea>'),
    );

    const result = await parseSpreadsheetFile({
      fileName: "带图例.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.charts).toHaveLength(0);
    expect(result.warnings).toEqual([{ code: "UNSUPPORTED_FEATURE", feature: "charts", count: 1 }]);
  });

  it("ignores non-visibility data-label extensions written by Excel", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace(
        "</c:dLbls>",
        '<c:numFmt formatCode="General" sourceLinked="1"/><c:extLst><c:ext uri="{test}"/></c:extLst></c:dLbls>',
      ),
    );

    const result = await parseSpreadsheetFile({
      fileName: "Excel保存的图表.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.charts).toHaveLength(1);
  });

  it("ignores Excel default data-label flags that do not display labels", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace(
        "<c:lineChart>",
        '<c:lineChart><c:dLbls><c:showBubbleSize val="1"/><c:showLeaderLines val="1"/></c:dLbls>',
      ),
    );

    const result = await parseSpreadsheetFile({
      fileName: "Excel默认图表标签属性.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.charts).toHaveLength(1);
    expect(result.warnings).toBeUndefined();
  });

  it("reports unsupported optional XLSX parts without blocking sheet import", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    zip.file(
      "xl/comments1.xml",
      '<comments xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"/>',
    );

    const result = await parseSpreadsheetFile({
      fileName: "带批注.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.warnings).toEqual([
      { code: "UNSUPPORTED_FEATURE", feature: "comments", count: 1 },
    ]);
  });

  it("skips charts with visible data labels", async () => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace('<c:showVal val="0"/>', '<c:showVal val="1"/>'),
    );

    const result = await parseSpreadsheetFile({
      fileName: "带数据标签.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.charts).toHaveLength(0);
  });

  it.each([
    "stacked",
    "percentStacked",
  ] as const)("skips %s charts that cannot round-trip through ChartSpec", async (grouping) => {
    const zip = await JSZip.loadAsync(await chartXlsxBytes());
    const chartFile = zip.file("xl/charts/chart1.xml");
    if (!chartFile) throw new Error("test chart part is missing");
    const chartXml = await chartFile.async("string");
    zip.file(
      "xl/charts/chart1.xml",
      chartXml.replace('<c:grouping val="standard"/>', `<c:grouping val="${grouping}"/>`),
    );

    const result = await parseSpreadsheetFile({
      fileName: "堆叠图.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.charts).toHaveLength(0);
  });

  it("skips chart titles linked to cells instead of flattening their formula", async () => {
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

    const result = await parseSpreadsheetFile({
      fileName: "动态标题.xlsx",
      format: "xlsx",
      bytes: await zip.generateAsync({ type: "arraybuffer" }),
    });

    expect(result.sheets).toHaveLength(1);
    expect(result.charts).toHaveLength(0);
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
