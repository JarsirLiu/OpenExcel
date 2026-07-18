import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import type { ChartSpec } from "../chart/chartModel.js";
import { workbookToXlsx } from "./xlsxWorkbookExporter.js";

function chart(): ChartSpec {
  return {
    id: "chart-1",
    workbookId: "workbook-1",
    sheetId: "sheet-1",
    type: "line",
    title: "销售趋势",
    anchor: {
      kind: "twoCell",
      from: { row: 1, col: 3 },
      to: { row: 16, col: 11 },
    },
    series: [
      {
        id: "series-1",
        name: "销售额",
        categoryRef: {
          sheetId: "sheet-1",
          start: { row: 1, col: 0 },
          end: { row: 5, col: 0 },
        },
        valueRef: {
          sheetId: "sheet-1",
          start: { row: 1, col: 1 },
          end: { row: 5, col: 1 },
        },
      },
    ],
  };
}

describe("workbookToXlsx", () => {
  it("writes worksheet data through the workbook-level export contract", async () => {
    const buffer = await workbookToXlsx({
      workbookId: "workbook-1",
      sheets: [
        {
          id: "sheet-1",
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
                bd: { t: { s: 8, c: "#112233" } },
              },
            },
          ],
          config: {
            luckysheet_select_save: [{ row: [28, 28], column: [7, 7] }],
            filter_select: { row: [0, 2], column: [0, 4] },
            config: { columnlen: { 0: 219 } },
          },
        },
      ],
      charts: [],
    });

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    const worksheet = workbook.getWorksheet("Sheet1");

    expect(worksheet?.views[0]?.activeCell).toBe("H29");
    expect(worksheet?.autoFilter).toBe("A1:E3");
    expect(worksheet?.getColumn(1).width).toBeCloseTo(219 / 7);
    expect(worksheet?.getCell("A1").font?.color).toEqual({ argb: "80112233" });
  });

  it("writes chart, drawing, and relationship parts from ChartSpec", async () => {
    const buffer = await workbookToXlsx({
      workbookId: "workbook-1",
      sheets: [
        {
          id: "sheet-1",
          name: "销售明细",
          celldata: [],
        },
      ],
      charts: [chart()],
    });

    const zip = await JSZip.loadAsync(buffer);
    const chartXml = await zip.file("xl/charts/chart1.xml")?.async("string");
    const drawingXml = await zip.file("xl/drawings/drawing1.xml")?.async("string");
    const drawingRelationships = await zip
      .file("xl/drawings/_rels/drawing1.xml.rels")
      ?.async("string");
    const worksheetRelationships = await zip
      .file("xl/worksheets/_rels/sheet1.xml.rels")
      ?.async("string");

    expect(chartXml).toContain("销售趋势");
    expect(chartXml).toContain('<c:marker><c:symbol val="circle"/></c:marker>');
    expect(chartXml).not.toContain('<c:marker val="1"/>');
    expect(chartXml).toContain("'销售明细'!$A$2:$A$6");
    expect(chartXml).toContain("'销售明细'!$B$2:$B$6");
    expect(drawingXml).toContain("twoCellAnchor");
    expect(drawingXml).toContain("<xdr:from>");
    expect(drawingXml).toContain("<xdr:to>");
    expect(drawingXml).toContain('r:id="rId1"');
    expect(drawingRelationships).toContain('Target="../charts/chart1.xml"');
    expect(worksheetRelationships).toContain('Target="../drawings/drawing1.xml"');
  });

  it("rejects chart references outside the exported workbook", async () => {
    await expect(
      workbookToXlsx({
        workbookId: "workbook-1",
        sheets: [{ id: "sheet-1", name: "Sheet1", celldata: [] }],
        charts: [{ ...chart(), sheetId: "missing-sheet" }],
      }),
    ).rejects.toThrow("unknown sheet");
  });
});
