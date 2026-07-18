import {
  type ChartAnchor,
  type ChartSeriesSpec,
  type ChartSpec,
  chartDependencySheetIds,
  parseChartSpec,
} from "@openexcel/core";
import { generatePublicId } from "../../../shared/utils/publicId.js";
import { deserializeChartSpec } from "../domain/chart.js";
import * as repository from "../infrastructure/chartRepository.js";

export type CreateChartInput = Omit<ChartSpec, "id"> & { id?: string };
export type UpdateChartInput = {
  type?: ChartSpec["type"];
  title?: string | null;
  sheetId?: string;
  anchor?: ChartAnchor;
  series?: ChartSeriesSpec[];
};

function toSpec(record: Awaited<ReturnType<typeof repository.findChart>>) {
  return record ? deserializeChartSpec(record) : null;
}

export async function listCharts(workspaceId: number, workbookId: number) {
  const records = await repository.findChartsForWorkbook(workspaceId, workbookId);
  return records.map(deserializeChartSpec);
}

export async function findChartsReferencingSheet(
  workspaceId: number,
  workbookId: number,
  sheetId: number,
) {
  const charts = await listCharts(workspaceId, workbookId);
  return charts
    .filter((chart) => chartDependencySheetIds(chart).includes(String(sheetId)))
    .map((chart) => chart.id);
}

export async function getChartRecord(workspaceId: number, chartId: string) {
  const record = await repository.findChart(workspaceId, chartId);
  if (!record) return null;
  return { spec: deserializeChartSpec(record), order: record.order };
}

export function buildChartSpec(input: CreateChartInput): ChartSpec {
  return parseChartSpec({
    ...input,
    id: input.id ?? generatePublicId("chart"),
  });
}

export function buildUpdatedChartSpec(previous: ChartSpec, patch: UpdateChartInput): ChartSpec {
  return parseChartSpec({
    ...previous,
    ...patch,
    id: previous.id,
    workbookId: previous.workbookId,
    title: patch.title === null ? undefined : (patch.title ?? previous.title),
  });
}

export async function persistChart(workspaceId: number, spec: ChartSpec) {
  const created = await repository.createChart(workspaceId, spec);
  return toSpec(created);
}

export async function persistUpdatedChart(workspaceId: number, chartId: string, spec: ChartSpec) {
  return toSpec(await repository.updateChart(workspaceId, chartId, spec));
}

export async function persistDeletedChart(workspaceId: number, chartId: string) {
  const deleted = await repository.deleteChart(workspaceId, chartId);
  return deleted != null;
}

export type { ChartStorageError } from "../domain/chart.js";
export { ChartValidationError } from "../domain/chart.js";
