import { type ChartAnchor, type ChartSpec, parseChartSpec } from "../chart/chartModel.js";
import type { ImportedChartInput } from "../excel/workbookImport.js";
import { parseSeries } from "./xlsxChartFormula.js";
import type { XlsxChartImportBudget } from "./xlsxChartLimits.js";
import {
  attribute,
  child,
  children,
  descendant,
  localName,
  numberAttribute,
  richTextContent,
  textContent,
  XlsxChartImportError,
  type XmlNode,
} from "./xlsxXml.js";

function parseChartTitle(root: XmlNode, path: string): string | undefined {
  const title = child(child(root, "chart") ?? root, "title");
  if (!title) return undefined;

  const tx = child(title, "tx");
  if (!tx) throw new XlsxChartImportError(`XLSX 图表标题缺少文本：${path}`);

  const rich = child(tx, "rich");
  if (rich) return richTextContent(rich) || undefined;

  const literal = child(tx, "v");
  if (literal) return textContent(literal) || undefined;

  if (child(tx, "strRef")) {
    throw new XlsxChartImportError(`暂不支持引用单元格的 XLSX 图表标题：${path}`);
  }

  throw new XlsxChartImportError(`暂不支持的 XLSX 图表标题格式：${path}`);
}

function numberText(node: XmlNode | undefined, path: string): number {
  if (!node) throw new XlsxChartImportError(`XLSX 图表缺少坐标：${path}`);
  const value = Number(textContent(node));
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new XlsxChartImportError(`XLSX 图表中的坐标无效：${path}`);
  }
  return value;
}

function parseAnchorPoint(node: XmlNode, path: string) {
  const point = {
    row: numberText(child(node, "row"), path),
    col: numberText(child(node, "col"), path),
  };
  const colOffset = child(node, "colOff");
  const rowOffset = child(node, "rowOff");
  return {
    ...point,
    ...(colOffset ? { offsetXEmu: numberText(colOffset, path) } : {}),
    ...(rowOffset ? { offsetYEmu: numberText(rowOffset, path) } : {}),
  };
}

export function parseAnchor(anchor: XmlNode, path: string): ChartAnchor {
  const kind = localName(anchor.name);
  if (kind === "absoluteAnchor") {
    const position = child(anchor, "pos");
    const extent = child(anchor, "ext");
    if (!position || !extent) throw new XlsxChartImportError(`XLSX 图表锚点缺少位置：${path}`);
    return {
      kind: "absolute",
      xEmu: numberAttribute(position, "x", path),
      yEmu: numberAttribute(position, "y", path),
      widthEmu: numberAttribute(extent, "cx", path),
      heightEmu: numberAttribute(extent, "cy", path),
    };
  }

  const fromNode = child(anchor, "from");
  if (!fromNode) throw new XlsxChartImportError(`XLSX 图表锚点缺少起点：${path}`);
  const from = parseAnchorPoint(fromNode, path);
  if (kind === "oneCellAnchor") {
    const extent = child(anchor, "ext");
    if (!extent) throw new XlsxChartImportError(`XLSX 图表锚点缺少尺寸：${path}`);
    return {
      kind: "oneCell",
      from,
      widthEmu: numberAttribute(extent, "cx", path),
      heightEmu: numberAttribute(extent, "cy", path),
    };
  }

  const toNode = child(anchor, "to");
  if (!toNode) throw new XlsxChartImportError(`XLSX 图表锚点缺少终点：${path}`);
  return { kind: "twoCell", from, to: parseAnchorPoint(toNode, path) };
}

type ChartGroup = {
  type: "bar" | "line" | "area" | "pie" | "scatter";
  node: XmlNode;
  series: XmlNode[];
  axisIds: string[];
};

function chartGroups(plotArea: XmlNode, path: string): ChartGroup[] {
  const groups: ChartGroup[] = [];
  for (const node of plotArea.children) {
    const type = localName(node.name);
    if (!["barChart", "lineChart", "areaChart", "pieChart", "scatterChart"].includes(type)) {
      if (type.endsWith("Chart")) {
        throw new XlsxChartImportError(`暂不支持的 XLSX 图表类型：${type}`);
      }
      continue;
    }
    const mapped =
      type === "barChart"
        ? "bar"
        : type === "lineChart"
          ? "line"
          : type === "areaChart"
            ? "area"
            : type === "pieChart"
              ? "pie"
              : "scatter";
    const barDirectionNode = child(node, "barDir");
    const barDirection = barDirectionNode ? attribute(barDirectionNode, "val") : undefined;
    if (mapped === "bar" && barDirection === "bar") {
      throw new XlsxChartImportError(`暂不支持横向条形图：${path}`);
    }
    if (mapped === "bar" && barDirection != null && barDirection !== "col") {
      throw new XlsxChartImportError(`暂不支持的柱形图方向：${path}`);
    }
    const groupingNode = child(node, "grouping");
    const grouping = groupingNode ? attribute(groupingNode, "val") : undefined;
    const expectedGrouping =
      mapped === "bar"
        ? "clustered"
        : mapped === "line" || mapped === "area"
          ? "standard"
          : undefined;
    if (expectedGrouping && grouping != null && grouping !== expectedGrouping) {
      throw new XlsxChartImportError(`暂不支持的 XLSX 图表分组方式：${path}`);
    }
    groups.push({
      type: mapped,
      node,
      series: children(node, "ser"),
      axisIds: children(node, "axId")
        .map((axis) => attribute(axis, "val"))
        .filter((axis): axis is string => axis != null),
    });
  }
  if (groups.length === 0) throw new XlsxChartImportError(`XLSX 图表没有可支持的图表组：${path}`);
  if (groups.some((group) => group.series.length === 0)) {
    throw new XlsxChartImportError(`XLSX 图表组没有数据系列：${path}`);
  }
  return groups;
}

function assertUnsupportedPresentation(root: XmlNode, groups: readonly ChartGroup[], path: string) {
  const chart = child(root, "chart") ?? root;
  const legend = child(chart, "legend");
  const legendPosition = legend
    ? attribute(child(legend, "legendPos") ?? legend, "val")
    : undefined;
  const unsupported = [child(chart, "spPr"), child(chart, "txPr"), child(chart, "view3D")];
  if (unsupported.some(Boolean)) {
    throw new XlsxChartImportError(`XLSX 图表包含尚未建模的展示属性：${path}`);
  }
  if (legend && legendPosition !== "t") {
    throw new XlsxChartImportError(`XLSX 图表包含尚未建模的展示属性：${path}`);
  }

  for (const group of groups) {
    const dataLabels = child(group.node, "dLbls");
    const hasVisibleDataLabels = dataLabels?.children.some(
      (node) => attribute(node, "val") !== "0",
    );
    if (hasVisibleDataLabels) {
      throw new XlsxChartImportError(`XLSX 图表包含尚未建模的系列展示属性：${path}`);
    }
    for (const series of group.series) {
      if (child(series, "txPr")) {
        throw new XlsxChartImportError(`XLSX 图表包含尚未建模的系列样式：${path}`);
      }
    }
  }

  for (const axis of plotAreaAxes(root)) {
    if (child(axis, "title") || child(axis, "spPr") || child(axis, "txPr")) {
      throw new XlsxChartImportError(`XLSX 图表包含尚未建模的坐标轴展示属性：${path}`);
    }
  }
}

function plotAreaAxes(root: XmlNode): XmlNode[] {
  const plotArea = descendant(root, "plotArea");
  return (
    plotArea?.children.filter((node) => ["catAx", "valAx"].includes(localName(node.name))) ?? []
  );
}

export function parseChart(
  root: XmlNode,
  anchorSheetKey: string,
  anchor: ChartAnchor,
  sheetKeyByName: ReadonlyMap<string, string>,
  chartIndex: number,
  path: string,
  budget: XlsxChartImportBudget,
): ImportedChartInput {
  const plotArea = descendant(root, "plotArea");
  if (!plotArea) throw new XlsxChartImportError(`XLSX 图表缺少绘图区：${path}`);
  const groups = chartGroups(plotArea, path);
  assertUnsupportedPresentation(root, groups, path);
  budget.assertSeriesCount(
    groups.reduce((total, group) => total + group.series.length, 0),
    path,
  );
  const hasPie = groups.some((group) => group.type === "pie");
  const hasScatter = groups.some((group) => group.type === "scatter");
  if ((hasPie || hasScatter) && groups.length > 1) {
    throw new XlsxChartImportError(`暂不支持包含饼图或散点图的组合图：${path}`);
  }
  const type: ChartSpec["type"] = groups.length === 1 ? groups[0].type : "combo";
  if (type === "combo" && groups.some((group) => !["bar", "line", "area"].includes(group.type))) {
    throw new XlsxChartImportError(`XLSX 组合图包含当前模型不支持的图表类型：${path}`);
  }
  if (type === "combo") {
    const firstAxes = groups[0]?.axisIds.join(",");
    if (groups.some((group) => group.axisIds.join(",") !== firstAxes)) {
      throw new XlsxChartImportError(`暂不支持带第二坐标轴的组合图：${path}`);
    }
  }
  let seriesIndex = 0;
  const series = groups.flatMap((group) =>
    group.series.map((item) => {
      const parsed = parseSeries(item, group.type, seriesIndex, sheetKeyByName, path);
      seriesIndex += 1;
      return type === "combo" ? { ...parsed, chartType: group.type } : parsed;
    }),
  );
  const chart = {
    id: `imported-chart-${chartIndex + 1}`,
    sheetKey: anchorSheetKey,
    type,
    title: parseChartTitle(root, path),
    anchor,
    series,
  } satisfies ImportedChartInput;

  const validated = parseChartSpec({
    id: chart.id,
    workbookId: "imported-workbook",
    sheetId: chart.sheetKey,
    type: chart.type,
    title: chart.title,
    anchor: chart.anchor,
    series: chart.series.map((item) => ({
      id: item.id,
      name:
        typeof item.name === "object" ? { ...item.name, sheetId: item.name.sheetKey } : item.name,
      categoryRef: item.categoryRef
        ? { ...item.categoryRef, sheetId: item.categoryRef.sheetKey }
        : undefined,
      valueRef: { ...item.valueRef, sheetId: item.valueRef.sheetKey },
      chartType: item.chartType,
    })),
  });
  return {
    id: validated.id,
    type: validated.type,
    title: validated.title,
    anchor: validated.anchor,
    sheetKey: chart.sheetKey,
    series: validated.series.map((item) => ({
      ...item,
      categoryRef: item.categoryRef
        ? { ...item.categoryRef, sheetKey: item.categoryRef.sheetId }
        : undefined,
      valueRef: { ...item.valueRef, sheetKey: item.valueRef.sheetId },
      name:
        typeof item.name === "object" ? { ...item.name, sheetKey: item.name.sheetId } : item.name,
    })),
  };
}
