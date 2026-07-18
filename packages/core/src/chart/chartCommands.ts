import type { ChartAnchor, ChartSeriesSpec, ChartSpec } from "./chartModel.js";
import { parseChartSpec } from "./chartModel.js";

export type ChartUpdate = {
  type?: ChartSpec["type"];
  title?: string | null;
  anchor?: ChartAnchor;
  series?: ChartSeriesSpec[];
};

export type ChartCommand =
  | { type: "chart.insert"; chart: ChartSpec }
  | { type: "chart.update"; chartId: string; patch: ChartUpdate }
  | { type: "chart.delete"; chartId: string };

export class ChartCommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChartCommandError";
  }
}

export type ChartCommandResult = {
  charts: ChartSpec[];
  inverse: ChartCommand;
};

function findChartIndex(charts: ChartSpec[], chartId: string): number {
  return charts.findIndex((chart) => chart.id === chartId);
}

function applyUpdate(chart: ChartSpec, patch: ChartUpdate): ChartSpec {
  return parseChartSpec({
    ...chart,
    ...patch,
    title: patch.title === null ? undefined : (patch.title ?? chart.title),
  });
}

export function applyChartCommand(
  currentCharts: readonly ChartSpec[],
  command: ChartCommand,
): ChartCommandResult {
  const charts = [...currentCharts];

  if (command.type === "chart.insert") {
    if (findChartIndex(charts, command.chart.id) >= 0) {
      throw new ChartCommandError(`Chart already exists: ${command.chart.id}`);
    }

    const chart = parseChartSpec(command.chart);
    return {
      charts: [...charts, chart],
      inverse: { type: "chart.delete", chartId: chart.id },
    };
  }

  const index = findChartIndex(charts, command.chartId);
  if (index < 0) {
    throw new ChartCommandError(`Chart not found: ${command.chartId}`);
  }

  const previous = charts[index];

  if (command.type === "chart.delete") {
    charts.splice(index, 1);
    return {
      charts,
      inverse: { type: "chart.insert", chart: previous },
    };
  }

  const updated = applyUpdate(previous, command.patch);
  charts[index] = updated;
  return {
    charts,
    inverse: {
      type: "chart.update",
      chartId: previous.id,
      patch: {
        type: previous.type,
        title: previous.title ?? null,
        anchor: previous.anchor,
        series: previous.series,
      },
    },
  };
}
