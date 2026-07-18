import { type ChartSpec, chartDependencySheetIds } from "@openexcel/core";
import * as runRepository from "../../sessions/runs/repository.js";
import { withUndoTrackedMutation } from "../../sessions/runs/undoCheckpoint.js";
import { parseChartRelationId } from "../domain/chart.js";
import {
  buildChartSpec,
  buildUpdatedChartSpec,
  type CreateChartInput,
  getChartRecord,
  persistChart,
  persistDeletedChart,
  persistUpdatedChart,
  type UpdateChartInput,
} from "./chartService.js";

export type ChartRunContext = { runId?: number };

export class ChartMutationNotFoundError extends Error {
  constructor(chartId: string) {
    super(`Chart ${chartId} 不存在`);
    this.name = "ChartMutationNotFoundError";
  }
}

function dependencySheetIds(specs: readonly ChartSpec[]): number[] {
  return [
    ...new Set(
      specs.flatMap((spec) =>
        chartDependencySheetIds(spec).map((sheetId) => parseChartRelationId(sheetId, "sheetId")),
      ),
    ),
  ];
}

export async function createChartMutation(
  workspaceId: number,
  input: CreateChartInput,
  context: ChartRunContext = {},
) {
  const spec = buildChartSpec(input);
  return withUndoTrackedMutation(
    workspaceId,
    dependencySheetIds([spec]),
    async () => {
      if (context.runId != null) {
        await runRepository.upsertRunChartSnapshot({
          runId: context.runId,
          chartId: spec.id,
          workbookId: parseChartRelationId(spec.workbookId, "workbookId"),
          sheetId: parseChartRelationId(spec.sheetId, "sheetId"),
          sheetIds: dependencySheetIds([spec]),
          order: 0,
          spec: null,
        });
      }
      const result = await persistChart(workspaceId, spec);
      if (!result) throw new Error(`Workbook ${spec.workbookId} 不存在`);
      return result;
    },
    context.runId,
  );
}

export async function updateChartMutation(
  workspaceId: number,
  chartId: string,
  patch: UpdateChartInput,
  context: ChartRunContext = {},
) {
  let previous: ChartSpec | null = null;
  let next: ChartSpec | null = null;
  let previousOrder = 0;

  return withUndoTrackedMutation(
    workspaceId,
    async () => {
      const current = await getChartRecord(workspaceId, chartId);
      if (!current) throw new ChartMutationNotFoundError(chartId);
      previous = current.spec;
      next = buildUpdatedChartSpec(current.spec, patch);
      previousOrder = current.order;
      return dependencySheetIds([previous, next]);
    },
    async () => {
      if (!previous || !next) throw new ChartMutationNotFoundError(chartId);
      if (context.runId != null) {
        await runRepository.upsertRunChartSnapshot({
          runId: context.runId,
          chartId: previous.id,
          workbookId: parseChartRelationId(previous.workbookId, "workbookId"),
          sheetId: parseChartRelationId(previous.sheetId, "sheetId"),
          sheetIds: dependencySheetIds([previous, next]),
          order: previousOrder,
          spec: JSON.stringify(previous),
        });
      }
      return persistUpdatedChart(workspaceId, chartId, next);
    },
    context.runId,
  );
}

export async function deleteChartMutation(
  workspaceId: number,
  chartId: string,
  context: ChartRunContext = {},
) {
  let previous: ChartSpec | null = null;
  let previousOrder = 0;

  return withUndoTrackedMutation(
    workspaceId,
    async () => {
      const current = await getChartRecord(workspaceId, chartId);
      if (!current) throw new ChartMutationNotFoundError(chartId);
      previous = current.spec;
      previousOrder = current.order;
      return dependencySheetIds([current.spec]);
    },
    async () => {
      if (!previous) throw new ChartMutationNotFoundError(chartId);
      if (context.runId != null) {
        await runRepository.upsertRunChartSnapshot({
          runId: context.runId,
          chartId: previous.id,
          workbookId: parseChartRelationId(previous.workbookId, "workbookId"),
          sheetId: parseChartRelationId(previous.sheetId, "sheetId"),
          sheetIds: dependencySheetIds([previous]),
          order: previousOrder,
          spec: JSON.stringify(previous),
        });
      }
      const deleted = await persistDeletedChart(workspaceId, chartId);
      if (!deleted) throw new Error(`Chart ${chartId} 不存在`);
      return { success: true, chartId };
    },
    context.runId,
  );
}
