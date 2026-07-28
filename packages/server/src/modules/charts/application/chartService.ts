import {
  type ChartAnchor,
  type ChartSeriesSpec,
  type ChartSpec,
  chartDependencySheetIds,
  parseChartSpec,
} from "@openexcel/core";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { generatePublicId } from "../../../shared/utils/publicId.js";
import { sheetRecordToSnapshot } from "../../../shared/utils/sheetSnapshot.js";
import { findSheetForWorkspace } from "../../sheets/infrastructure/sheetRepository.js";
import {
  ChartValidationError,
  deserializeChartSpec,
  parseChartRelationId,
} from "../domain/chart.js";
import { normalizeChartSpecForSheets } from "../domain/chartDataValidation.js";
import * as repository from "../infrastructure/chartRepository.js";

export type CreateChartInput = Omit<ChartSpec, "id"> & { id?: string };
export type UpdateChartInput = {
  type?: ChartSpec["type"];
  title?: string | null;
  sheetId?: string;
  anchor?: ChartAnchor;
  series?: ChartSeriesSpec[];
};

export async function normalizeChartSpecForWorkspace(
  workspaceId: number,
  spec: ChartSpec,
  db?: Prisma.TransactionClient,
): Promise<ChartSpec> {
  const sheetIds = chartDependencySheetIds(spec).map((sheetId) =>
    parseChartRelationId(sheetId, "sheetId"),
  );
  const sheets = db
    ? await db.sheet.findMany({
        where: { id: { in: sheetIds }, workbook: { workspaceId } },
        select: { id: true, uploadedData: true, config: true, merges: true },
      })
    : await Promise.all(sheetIds.map((sheetId) => findSheetForWorkspace(sheetId, workspaceId)));

  const existingSheets = sheets.filter(
    (sheet): sheet is NonNullable<typeof sheet> => sheet != null,
  );
  if (existingSheets.length !== new Set(sheetIds).size) {
    throw new ChartValidationError("图表引用的 Sheet 不存在或不属于当前工作区");
  }

  return normalizeChartSpecForSheets(
    spec,
    existingSheets.map((sheet) => ({
      id: String(sheet.id),
      celldata: sheetRecordToSnapshot(sheet).celldata,
    })),
  );
}

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
  return toMutationRecord(record);
}

export async function getChartRecordInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  chartId: string,
) {
  return toMutationRecord(await repository.findChartInTransaction(tx, workspaceId, chartId));
}

function toMutationRecord(record: Awaited<ReturnType<typeof repository.findChart>>) {
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
