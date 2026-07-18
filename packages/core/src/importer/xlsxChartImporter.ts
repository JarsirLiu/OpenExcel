import JSZip from "jszip";
import type { ImportedChartInput } from "../excel/workbookImport.js";
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
} from "./xlsxXml.js";

async function parseDrawing(
  zip: JSZip,
  drawingPath: string,
  anchorSheetKey: string,
  sheetKeyByName: ReadonlyMap<string, string>,
  budget: XlsxChartImportBudget,
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
  }
  return charts;
}

export async function parseXlsxCharts(
  bytes: Uint8Array | ArrayBuffer,
  limits: XlsxChartImportLimits = DEFAULT_XLSX_CHART_IMPORT_LIMITS,
): Promise<ImportedChartInput[]> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(bytes);
  } catch (error) {
    throw new XlsxChartImportError("无法读取 XLSX ZIP 容器", { cause: error });
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
    charts.push(...(await parseDrawing(zip, drawingPath, sheet.key, sheetKeyByName, budget)));
  }
  return charts;
}

export {
  DEFAULT_XLSX_CHART_IMPORT_LIMITS,
  type XlsxChartImportLimits,
} from "./xlsxChartLimits.js";
export { XlsxChartImportError } from "./xlsxXml.js";
