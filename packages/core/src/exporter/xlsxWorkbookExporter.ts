import ExcelJS from "exceljs";
import type { ChartSpec } from "../chart/chartModel.js";
import { writeSheetToWorksheet } from "./excelJsWorksheet.js";
import { createChartXml, createDrawingRelationships, createDrawingXml } from "./xlsxChartXml.js";
import type { ExcelSheetInput } from "./xlsxExportTypes.js";
import { assembleXlsxPackage, type WorksheetDrawingPackage } from "./xlsxPackage.js";

export interface XlsxWorkbookInput {
  workbookId: string;
  sheets: readonly ExcelSheetInput[];
  charts: readonly ChartSpec[];
}

function buildSheetNameResolver(sheets: readonly ExcelSheetInput[]): (sheetId: string) => string {
  const names = new Map(sheets.map((sheet) => [sheet.id, sheet.name]));
  return (sheetId) => {
    const name = names.get(sheetId);
    if (!name) throw new Error(`Chart references an unknown sheet: ${sheetId}`);
    return name;
  };
}

function validateWorkbookCharts(input: XlsxWorkbookInput): void {
  const sheetIds = new Set(input.sheets.map((sheet) => sheet.id));
  for (const chart of input.charts) {
    if (chart.workbookId !== input.workbookId) {
      throw new Error(`Chart belongs to a different workbook: ${chart.id}`);
    }
    if (!sheetIds.has(chart.sheetId)) {
      throw new Error(`Chart is anchored to an unknown sheet: ${chart.sheetId}`);
    }
    for (const series of chart.series) {
      if (!sheetIds.has(series.valueRef.sheetId)) {
        throw new Error(`Chart series references an unknown sheet: ${series.valueRef.sheetId}`);
      }
      if (series.categoryRef && !sheetIds.has(series.categoryRef.sheetId)) {
        throw new Error(
          `Chart categories reference an unknown sheet: ${series.categoryRef.sheetId}`,
        );
      }
      if (typeof series.name === "object" && !sheetIds.has(series.name.sheetId)) {
        throw new Error(`Chart series name references an unknown sheet: ${series.name.sheetId}`);
      }
    }
  }
}

function buildDrawingPackages(
  input: XlsxWorkbookInput,
  resolveSheetName: (sheetId: string) => string,
): WorksheetDrawingPackage[] {
  const chartsBySheet = new Map<string, ChartSpec[]>();
  for (const chart of input.charts) {
    const charts = chartsBySheet.get(chart.sheetId);
    if (charts) charts.push(chart);
    else chartsBySheet.set(chart.sheetId, [chart]);
  }

  const sheetIndexes = new Map(input.sheets.map((sheet, index) => [sheet.id, index]));
  let chartIndex = 0;
  return [...chartsBySheet.entries()]
    .sort(([left], [right]) => (sheetIndexes.get(left) ?? 0) - (sheetIndexes.get(right) ?? 0))
    .map(([sheetId, charts]) => {
      const sheetIndex = sheetIndexes.get(sheetId);
      if (sheetIndex == null) throw new Error(`Chart is anchored to an unknown sheet: ${sheetId}`);

      const drawingIndex = sheetIndex + 1;
      const chartParts = charts.map((chart) => {
        const path = `chart${chartIndex + 1}.xml`;
        const part = {
          path,
          xml: createChartXml(chart, resolveSheetName, chartIndex),
        };
        chartIndex += 1;
        return part;
      });
      const relationshipIds = charts.map((_, index) => `rId${index + 1}`);
      return {
        worksheetPath: `xl/worksheets/sheet${sheetIndex + 1}.xml`,
        drawingPath: `drawing${drawingIndex}.xml`,
        drawingXml: createDrawingXml(charts, relationshipIds),
        drawingRelationshipsXml: createDrawingRelationships(
          charts.length,
          chartIndex - charts.length,
        ),
        chartParts,
      };
    });
}

export async function workbookToXlsx(input: XlsxWorkbookInput): Promise<ArrayBuffer> {
  if (input.sheets.length === 0) throw new Error("Workbook must contain at least one sheet");
  validateWorkbookCharts(input);

  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  for (const sheet of input.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    writeSheetToWorksheet(worksheet, sheet);
  }

  const baseBuffer = (await workbook.xlsx.writeBuffer({
    useStyles: true,
    useSharedStrings: true,
  })) as ArrayBuffer;
  const resolveSheetName = buildSheetNameResolver(input.sheets);
  return assembleXlsxPackage(baseBuffer, buildDrawingPackages(input, resolveSheetName));
}
