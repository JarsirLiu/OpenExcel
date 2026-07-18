import type { ChartSpec } from "../chart/chartModel.js";
import type { ImportedChartSeries, ImportedRangeReference } from "../excel/workbookImport.js";
import { child, descendant, textContent, XlsxChartImportError, type XmlNode } from "./xlsxXml.js";

function parseColumn(value: string): number {
  let result = 0;
  for (const character of value.toUpperCase()) {
    const code = character.charCodeAt(0) - 64;
    if (code < 1 || code > 26) throw new XlsxChartImportError(`XLSX 图表列引用无效：${value}`);
    result = result * 26 + code;
  }
  return result - 1;
}

export function parseReferenceFormula(
  formula: string,
  sheetKeyByName: ReadonlyMap<string, string>,
  path: string,
): ImportedRangeReference {
  const normalized = formula.trim().replace(/^=/, "");
  const match = normalized.match(
    /^(?:'((?:''|[^'])+)'|([^!]+))!\$?([A-Z]+)\$?(\d+)(?::\$?([A-Z]+)\$?(\d+))?$/i,
  );
  if (!match) {
    throw new XlsxChartImportError(`暂不支持的 XLSX 图表数据引用：${formula}`, { cause: path });
  }

  const sheetName = (match[1] ?? match[2]).replace(/''/g, "'");
  const sheetKey = sheetKeyByName.get(sheetName);
  if (!sheetKey) throw new XlsxChartImportError(`图表引用了不存在的 Sheet：${sheetName}`);
  const start = {
    row: Number(match[4]) - 1,
    col: parseColumn(match[3]),
  };
  const end = {
    row: Number(match[6] ?? match[4]) - 1,
    col: parseColumn(match[5] ?? match[3]),
  };
  if (
    !Number.isSafeInteger(start.row) ||
    !Number.isSafeInteger(end.row) ||
    start.row < 0 ||
    end.row < start.row ||
    end.col < start.col
  ) {
    throw new XlsxChartImportError(`XLSX 图表数据范围无效：${formula}`);
  }
  return { sheetKey, start, end };
}

export function parseFormulaReference(
  node: XmlNode | undefined,
  sheetKeyByName: ReadonlyMap<string, string>,
  path: string,
): ImportedRangeReference | undefined {
  const formulaNode = node ? descendant(node, "f") : undefined;
  const formula = textContent(formulaNode);
  return formula ? parseReferenceFormula(formula, sheetKeyByName, path) : undefined;
}

export function parseSeriesName(
  series: XmlNode,
  sheetKeyByName: ReadonlyMap<string, string>,
  path: string,
): string | ImportedRangeReference | undefined {
  const tx = child(series, "tx");
  if (!tx) return undefined;
  const literal = textContent(child(tx, "v"));
  if (literal) return literal;
  return parseFormulaReference(tx, sheetKeyByName, path);
}

export function parseSeries(
  series: XmlNode,
  chartType: ChartSpec["type"] | NonNullable<ImportedChartSeries["chartType"]>,
  index: number,
  sheetKeyByName: ReadonlyMap<string, string>,
  path: string,
): ImportedChartSeries {
  const scatter = chartType === "scatter";
  const categoryNode = child(series, scatter ? "xVal" : "cat");
  const valueNode = child(series, scatter ? "yVal" : "val");
  const valueRef = parseFormulaReference(valueNode, sheetKeyByName, path);
  if (!valueRef) throw new XlsxChartImportError(`XLSX 图表系列缺少数值引用：${path}`);
  const categoryRef = parseFormulaReference(categoryNode, sheetKeyByName, path);
  if ((scatter || chartType === "pie") && !categoryRef) {
    throw new XlsxChartImportError(`XLSX 图表系列缺少分类引用：${path}`);
  }

  return {
    id: `series-${index + 1}`,
    name: parseSeriesName(series, sheetKeyByName, path),
    categoryRef,
    valueRef,
  };
}
