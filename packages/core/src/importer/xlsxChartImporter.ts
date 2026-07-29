import JSZip from "jszip";
import type { ImportedChartInput, ImportedWorkbookWarning } from "../excel/workbookImport.js";
import {
  DEFAULT_XLSX_CHART_IMPORT_LIMITS,
  XlsxChartImportBudget,
  type XlsxChartImportLimits,
} from "./xlsxChartLimits.js";
import { parseAnchor, parseChart } from "./xlsxChartPartParser.js";
import {
  readRelationships,
  relationshipPath,
  relationshipTarget,
  resolveTarget,
} from "./xlsxRelationships.js";
import {
  attribute,
  child,
  children,
  descendant,
  readRequiredXml,
  XlsxChartImportError,
  XlsxChartUnsupportedError,
} from "./xlsxXml.js";

export type XlsxChartImportResult = {
  charts: ImportedChartInput[];
  warnings: ImportedWorkbookWarning[];
};

function recordUnsupportedFeature(
  warnings: ImportedWorkbookWarning[],
  feature: ImportedWorkbookWarning["feature"],
): void {
  const existing = warnings.find((warning) => warning.feature === feature);
  if (existing) {
    existing.count += 1;
    return;
  }
  warnings.push({ code: "UNSUPPORTED_FEATURE", feature, count: 1 });
}

async function parseDrawing(
  zip: JSZip,
  drawingPath: string,
  anchorSheetKey: string,
  sheetKeyByName: ReadonlyMap<string, string>,
  budget: XlsxChartImportBudget,
  warnings: ImportedWorkbookWarning[],
): Promise<ImportedChartInput[]> {
  const root = await readRequiredXml(zip, drawingPath);
  const relationships = await readRelationships(zip, relationshipPath(drawingPath));
  const charts: ImportedChartInput[] = [];

  for (const anchor of root.children.filter((node) => descendant(node, "chart"))) {
    const chartNode = descendant(anchor, "chart");
    const relationId = chartNode ? attribute(chartNode, "id") : undefined;
    if (!relationId) continue;

    const relation = relationshipTarget(relationships, relationId, drawingPath);
    const chartPath = resolveTarget(drawingPath, relation.target);
    const chartIndex = budget.beginChart(chartPath);
    const chartXml = await readRequiredXml(zip, chartPath);
    try {
      charts.push(
        parseChart(
          chartXml,
          anchorSheetKey,
          parseAnchor(anchor, `${drawingPath}:${anchor.name}`),
          sheetKeyByName,
          chartIndex,
          chartPath,
          budget,
        ),
      );
    } catch (error) {
      if (error instanceof XlsxChartUnsupportedError) {
        recordUnsupportedFeature(warnings, "charts");
        continue;
      }
      throw error;
    }
  }
  return charts;
}

export async function parseXlsxCharts(
  bytes: Uint8Array | ArrayBuffer,
  limits: XlsxChartImportLimits = DEFAULT_XLSX_CHART_IMPORT_LIMITS,
): Promise<XlsxChartImportResult> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (error) {
    throw new XlsxChartImportError("无法读取 XLSX ZIP 容器", { cause: error });
  }

  const packageEntries = Object.keys(zip.files);
  const warnings: ImportedWorkbookWarning[] = [];
  if (packageEntries.some((path) => /^xl\/(?:threadedComments\/|comments)/i.test(path))) {
    recordUnsupportedFeature(warnings, "comments");
  }
  if (packageEntries.some((path) => /^xl\/pivot(?:Tables|Cache)\//i.test(path))) {
    recordUnsupportedFeature(warnings, "pivotTables");
  }
  if (packageEntries.some((path) => /^xl\/externalLinks\//i.test(path))) {
    recordUnsupportedFeature(warnings, "externalLinks");
  }
  if (packageEntries.some((path) => /^xl\/vbaProject\.bin$/i.test(path))) {
    recordUnsupportedFeature(warnings, "macros");
  }

  const workbookPath = "xl/workbook.xml";
  const workbook = await readRequiredXml(zip, workbookPath);
  const workbookRelationships = await readRelationships(zip, "xl/_rels/workbook.xml.rels");
  const sheetNodes = children(child(workbook, "sheets") ?? workbook, "sheet");
  const sheetKeyByName = new Map<string, string>();
  const sheetEntries: { key: string; path: string }[] = [];

  for (const [index, sheet] of sheetNodes.entries()) {
    const name = attribute(sheet, "name");
    const relationId = attribute(sheet, "id");
    const relation = relationId
      ? relationshipTarget(workbookRelationships, relationId, workbookPath)
      : undefined;
    if (!name || !relation) throw new XlsxChartImportError("XLSX 工作表关系无效");
    const key = `sheet-${index}`;
    sheetKeyByName.set(name, key);
    sheetEntries.push({ key, path: resolveTarget(workbookPath, relation.target) });
  }

  const budget = new XlsxChartImportBudget(limits);
  const charts: ImportedChartInput[] = [];
  for (const sheet of sheetEntries) {
    const worksheet = await readRequiredXml(zip, sheet.path);
    const drawingId = attribute(child(worksheet, "drawing") ?? worksheet, "id");
    if (!drawingId) continue;

    const drawingRelation = relationshipTarget(
      await readRelationships(zip, relationshipPath(sheet.path)),
      drawingId,
      sheet.path,
    );
    const drawingPath = resolveTarget(sheet.path, drawingRelation.target);
    charts.push(
      ...(await parseDrawing(zip, drawingPath, sheet.key, sheetKeyByName, budget, warnings)),
    );
  }
  return { charts, warnings };
}

export {
  DEFAULT_XLSX_CHART_IMPORT_LIMITS,
  type XlsxChartImportLimits,
} from "./xlsxChartLimits.js";
export { XlsxChartImportError } from "./xlsxXml.js";
