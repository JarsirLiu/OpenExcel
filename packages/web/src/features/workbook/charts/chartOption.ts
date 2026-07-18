import type { ChartSpec } from "@openexcel/core";
import type { EChartsOption } from "echarts";
import type { ChartRenderData } from "./chartData";

function chartType(
  type: ChartSpec["type"],
  seriesType?: NonNullable<ChartSpec["series"][number]["chartType"]>,
): "bar" | "line" | "scatter" {
  const value = type === "combo" ? seriesType : type;
  if (value === "bar") return "bar";
  if (value === "line" || value === "area") return "line";
  if (value === "scatter") return "scatter";
  throw new Error(`Unsupported Web chart series type: ${value ?? "missing"}`);
}

export function buildChartOption(chart: ChartSpec, data: ChartRenderData): EChartsOption {
  if (chart.type === "pie") {
    const firstSeries = data.series[0];
    return {
      title: chart.title ? { text: chart.title } : undefined,
      tooltip: { trigger: "item" },
      series: [
        {
          type: "pie",
          name: firstSeries?.name,
          data: data.categories.map((name, index) => ({
            name,
            value: firstSeries?.data[index] ?? 0,
          })),
        },
      ],
    };
  }

  const isScatter = chart.type === "scatter";

  return {
    title: chart.title ? { text: chart.title } : undefined,
    tooltip: { trigger: "axis" },
    legend: data.series.length > 1 ? { top: 28 } : undefined,
    grid: { top: chart.title ? 56 : 24, left: 48, right: 20, bottom: 32 },
    xAxis: isScatter ? { type: "value" } : { type: "category", data: data.categories },
    yAxis: { type: "value" },
    series: data.series.map((series) => ({
      name: series.name,
      type: chartType(chart.type, series.chartType),
      data: isScatter
        ? data.categories.map((category, index) => [Number(category), series.data[index] ?? 0])
        : series.data,
      ...(chart.type === "area" || (chart.type === "combo" && series.chartType === "area")
        ? { areaStyle: {} }
        : {}),
    })),
  };
}
