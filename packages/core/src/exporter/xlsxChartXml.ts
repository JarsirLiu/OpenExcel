import type { ChartSeriesSpec, ChartSpec, RangeReference } from "../chart/chartModel.js";
import { CHART_PALETTE } from "../chart/chartPalette.js";
import { rangeReferenceToA1 } from "../chart/chartReference.js";

const CHART_NS = "http://schemas.openxmlformats.org/drawingml/2006/chart";
const DRAWING_NS = "http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing";
const REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const MAIN_REL_NS = "http://schemas.openxmlformats.org/package/2006/relationships";
const OFFICE_REL_NS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

export type ChartSheetNameResolver = (sheetId: string) => string;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formula(reference: RangeReference, resolveSheetName: ChartSheetNameResolver): string {
  return rangeReferenceToA1(reference, resolveSheetName(reference.sheetId));
}

function seriesName(series: ChartSeriesSpec, resolveSheetName: ChartSheetNameResolver): string {
  if (typeof series.name === "string") {
    return `<c:tx><c:v>${escapeXml(series.name)}</c:v></c:tx>`;
  }
  if (series.name) {
    return `<c:tx><c:strRef><c:f>${escapeXml(formula(series.name, resolveSheetName))}</c:f></c:strRef></c:tx>`;
  }
  return "";
}

function categoryReference(
  series: ChartSeriesSpec,
  resolveSheetName: ChartSheetNameResolver,
): string {
  if (!series.categoryRef) return "";
  return `<c:cat><c:strRef><c:f>${escapeXml(formula(series.categoryRef, resolveSheetName))}</c:f></c:strRef></c:cat>`;
}

function valueReference(series: ChartSeriesSpec, resolveSheetName: ChartSheetNameResolver): string {
  return `<c:val><c:numRef><c:f>${escapeXml(formula(series.valueRef, resolveSheetName))}</c:f></c:numRef></c:val>`;
}

function seriesStyleXml(
  chartType: ChartSpec["type"] | NonNullable<ChartSeriesSpec["chartType"]>,
  index: number,
): string {
  const color = CHART_PALETTE[index % CHART_PALETTE.length].slice(1).toUpperCase();
  if (chartType === "line" || chartType === "scatter") {
    return `<c:spPr><a:ln w="19050"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:prstDash val="solid"/></a:ln></c:spPr>`;
  }
  return `<c:spPr><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:ln><a:noFill/></a:ln></c:spPr>`;
}

function scatterReference(
  tag: "xVal" | "yVal",
  reference: RangeReference,
  resolveSheetName: ChartSheetNameResolver,
): string {
  return `<c:${tag}><c:numRef><c:f>${escapeXml(formula(reference, resolveSheetName))}</c:f></c:numRef></c:${tag}>`;
}

function seriesXml(
  series: ChartSeriesSpec,
  index: number,
  chartType: ChartSpec["type"] | NonNullable<ChartSeriesSpec["chartType"]>,
  resolveSheetName: ChartSheetNameResolver,
): string {
  const name = seriesName(series, resolveSheetName);
  const title = name ? name : "";

  if (chartType === "scatter") {
    if (!series.categoryRef) {
      throw new Error(`Scatter chart series requires a category reference: ${series.id}`);
    }
    return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${title}${scatterReference("xVal", series.categoryRef, resolveSheetName)}${scatterReference("yVal", series.valueRef, resolveSheetName)}</c:ser>`;
  }

  const style = chartType === "pie" ? "" : seriesStyleXml(chartType, index);
  return `<c:ser><c:idx val="${index}"/><c:order val="${index}"/>${title}${style}${categoryReference(series, resolveSheetName)}${valueReference(series, resolveSheetName)}</c:ser>`;
}

function titleXml(title: string | undefined): string {
  if (!title) return "";
  return `<c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr><a:defRPr/></a:pPr><a:r><a:rPr lang="zh-CN" sz="1400"/><a:t>${escapeXml(title)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></c:rich></c:tx><c:layout/><c:overlay val="0"/></c:title>`;
}

function axisXml(categoryAxisId: number, valueAxisId: number): string {
  return `<c:catAx><c:axId val="${categoryAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:crossAx val="${valueAxisId}"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="${valueAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:numFmt formatCode="General" sourceLinked="1"/><c:crossAx val="${categoryAxisId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
}

function scatterAxisXml(xAxisId: number, yAxisId: number): string {
  return `<c:valAx><c:axId val="${xAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:majorGridlines/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:numFmt formatCode="General" sourceLinked="1"/><c:crossAx val="${yAxisId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx><c:valAx><c:axId val="${yAxisId}"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines/><c:majorTickMark val="none"/><c:minorTickMark val="none"/><c:tickLblPos val="nextTo"/><c:numFmt formatCode="General" sourceLinked="1"/><c:crossAx val="${xAxisId}"/><c:crosses val="autoZero"/><c:crossBetween val="midCat"/></c:valAx>`;
}

function chartGroupXml(
  type: ChartSpec["type"] | NonNullable<ChartSeriesSpec["chartType"]>,
  series: readonly ChartSeriesSpec[],
  resolveSheetName: ChartSheetNameResolver,
  categoryAxisId: number,
  valueAxisId: number,
  seriesIndexById: ReadonlyMap<string, number>,
): string {
  const seriesMarkup = series
    .map((item, index) =>
      seriesXml(item, seriesIndexById.get(item.id) ?? index, type, resolveSheetName),
    )
    .join("");

  if (type === "bar") {
    return `<c:barChart><c:barDir val="col"/><c:grouping val="clustered"/><c:varyColors val="0"/>${seriesMarkup}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls><c:gapWidth val="150"/><c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/></c:barChart>`;
  }
  if (type === "line") {
    return `<c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesMarkup}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls><c:marker><c:symbol val="circle"/></c:marker><c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/></c:lineChart>`;
  }
  if (type === "area") {
    return `<c:areaChart><c:grouping val="standard"/><c:varyColors val="0"/>${seriesMarkup}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls><c:dropLines/><c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/></c:areaChart>`;
  }
  if (type === "pie") {
    return `<c:pieChart><c:varyColors val="1"/>${seriesMarkup}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls></c:pieChart>`;
  }
  if (type === "scatter") {
    return `<c:scatterChart><c:scatterStyle val="lineMarker"/><c:varyColors val="0"/>${seriesMarkup}<c:dLbls><c:showLegendKey val="0"/><c:showVal val="0"/><c:showCatName val="0"/><c:showSerName val="0"/><c:showPercent val="0"/></c:dLbls><c:axId val="${categoryAxisId}"/><c:axId val="${valueAxisId}"/></c:scatterChart>`;
  }
  throw new Error(`Unsupported chart type: ${type}`);
}

function groupSeries(chart: ChartSpec): {
  type: ChartSpec["type"] | NonNullable<ChartSeriesSpec["chartType"]>;
  series: ChartSeriesSpec[];
}[] {
  if (chart.type !== "combo") return [{ type: chart.type, series: [...chart.series] }];

  const groups = new Map<string, ChartSeriesSpec[]>();
  for (const series of chart.series) {
    const type = series.chartType ?? "bar";
    const group = groups.get(type);
    if (group) group.push(series);
    else groups.set(type, [series]);
  }
  return [...groups.entries()].map(([type, series]) => ({
    type: type as NonNullable<ChartSeriesSpec["chartType"]>,
    series,
  }));
}

export function createChartXml(
  chart: ChartSpec,
  resolveSheetName: ChartSheetNameResolver,
  chartIndex: number,
): string {
  const categoryAxisId = 100000 + chartIndex * 2;
  const valueAxisId = categoryAxisId + 1;
  const groups = groupSeries(chart);
  const seriesIndexById = new Map(chart.series.map((series, index) => [series.id, index]));
  const groupsXml = groups
    .map(({ type, series }) =>
      chartGroupXml(type, series, resolveSheetName, categoryAxisId, valueAxisId, seriesIndexById),
    )
    .join("");
  const hasScatter = groups.some(({ type }) => type === "scatter");
  const hasCartesian = groups.some(({ type }) => type !== "pie");
  if (hasScatter && groups.some(({ type }) => type !== "scatter")) {
    throw new Error("Scatter charts cannot be combined with other chart types");
  }
  const axes = hasScatter
    ? scatterAxisXml(categoryAxisId, valueAxisId)
    : hasCartesian
      ? axisXml(categoryAxisId, valueAxisId)
      : "";

  const legend =
    chart.type !== "pie" && chart.series.length > 1
      ? '<c:legend><c:legendPos val="t"/><c:layout/><c:overlay val="0"/></c:legend>'
      : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="${CHART_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><c:date1904 val="0"/><c:lang val="zh-CN"/><c:roundedCorners val="0"/><c:chart>${titleXml(chart.title)}<c:plotArea><c:layout/>${groupsXml}${axes}</c:plotArea>${legend}<c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart><c:printSettings><c:headerFooter/><c:pageMargins b="0.75" l="0.7" r="0.7" t="0.75" header="0.3" footer="0.3"/><c:pageSetup/></c:printSettings></c:chartSpace>`;
}

function marker(point: {
  row: number;
  col: number;
  offsetXEmu?: number;
  offsetYEmu?: number;
}): string {
  return `<xdr:col>${point.col}</xdr:col><xdr:colOff>${point.offsetXEmu ?? 0}</xdr:colOff><xdr:row>${point.row}</xdr:row><xdr:rowOff>${point.offsetYEmu ?? 0}</xdr:rowOff>`;
}

export function createDrawingXml(
  charts: readonly ChartSpec[],
  chartRelationships: readonly string[],
): string {
  const anchors = charts
    .map((chart, index) => {
      const relationshipId = chartRelationships[index];
      if (!relationshipId) throw new Error(`Missing chart relationship for ${chart.id}`);
      const graphic = `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${index + 2}" name="Chart ${index + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="1" cy="1"/></xdr:xfrm><a:graphic><a:graphicData uri="${CHART_NS}"><c:chart r:id="${relationshipId}"/></a:graphicData></a:graphic></xdr:graphicFrame>`;
      const clientData = "<xdr:clientData/>";
      if (chart.anchor.kind === "absolute") {
        return `<xdr:absoluteAnchor><xdr:pos x="${chart.anchor.xEmu}" y="${chart.anchor.yEmu}"/><xdr:ext cx="${chart.anchor.widthEmu}" cy="${chart.anchor.heightEmu}"/>${graphic}${clientData}</xdr:absoluteAnchor>`;
      }
      if (chart.anchor.kind === "oneCell") {
        return `<xdr:oneCellAnchor><xdr:from>${marker(chart.anchor.from)}</xdr:from><xdr:ext cx="${chart.anchor.widthEmu}" cy="${chart.anchor.heightEmu}"/>${graphic}${clientData}</xdr:oneCellAnchor>`;
      }
      return `<xdr:twoCellAnchor><xdr:from>${marker(chart.anchor.from)}</xdr:from><xdr:to>${marker(chart.anchor.to)}</xdr:to>${graphic}${clientData}</xdr:twoCellAnchor>`;
    })
    .join("");

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="${DRAWING_NS}" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:c="${CHART_NS}" xmlns:r="${REL_NS}">${anchors}</xdr:wsDr>`;
}

export function createDrawingRelationships(chartCount: number, chartStartIndex: number): string {
  const relationships = Array.from(
    { length: chartCount },
    (_, index) =>
      `<Relationship Id="rId${index + 1}" Type="${OFFICE_REL_NS}/chart" Target="../charts/chart${chartStartIndex + index + 1}.xml"/>`,
  ).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="${MAIN_REL_NS}">${relationships}</Relationships>`;
}
