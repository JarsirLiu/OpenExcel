import { XlsxChartImportError } from "./xlsxXml.js";

export interface XlsxChartImportLimits {
  maxChartsPerWorkbook: number;
  maxSeriesPerChart: number;
  maxTotalSeries: number;
}

export const DEFAULT_XLSX_CHART_IMPORT_LIMITS: XlsxChartImportLimits = {
  maxChartsPerWorkbook: 500,
  maxSeriesPerChart: 100,
  maxTotalSeries: 10_000,
};

export class XlsxChartImportBudget {
  private chartCount = 0;
  private totalSeries = 0;

  constructor(private readonly limits: XlsxChartImportLimits = DEFAULT_XLSX_CHART_IMPORT_LIMITS) {}

  beginChart(path: string): number {
    this.chartCount += 1;
    if (this.chartCount > this.limits.maxChartsPerWorkbook) {
      throw new XlsxChartImportError(
        `XLSX 图表数量超过安全限制：${this.limits.maxChartsPerWorkbook}`,
        { cause: path },
      );
    }
    return this.chartCount - 1;
  }

  assertSeriesCount(count: number, path: string): void {
    if (count > this.limits.maxSeriesPerChart) {
      throw new XlsxChartImportError(
        `XLSX 单个图表系列数量超过安全限制：${this.limits.maxSeriesPerChart}`,
        { cause: path },
      );
    }
    this.totalSeries += count;
    if (this.totalSeries > this.limits.maxTotalSeries) {
      throw new XlsxChartImportError(
        `XLSX 图表系列总数超过安全限制：${this.limits.maxTotalSeries}`,
        { cause: path },
      );
    }
  }
}
