import { type ChartSpec, chartDependencySheetIds } from "@openexcel/core";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import * as runRepository from "../../sessions/runs/repository.js";
import {
  withUndoTrackedMutation,
  withUndoTrackedSheetMutationAfterSuccess,
} from "../../sessions/runs/undoCheckpoint.js";
import { parseChartRelationId } from "../domain/chart.js";
import {
  findChartMutationReceipt,
  recordChartMutationReceipt,
} from "../infrastructure/chartMutationReceiptRepository.js";
import {
  createChartInTransaction,
  deleteChartInTransaction,
  updateChartInTransaction,
} from "../infrastructure/chartRepository.js";
import {
  buildChartSpec,
  buildUpdatedChartSpec,
  type CreateChartInput,
  getChartRecord,
  getChartRecordInTransaction,
  normalizeChartSpecForWorkspace,
  persistChart,
  persistDeletedChart,
  persistUpdatedChart,
  type UpdateChartInput,
} from "./chartService.js";

export type ChartRunContext = {
  runId?: number;
  db?: Prisma.TransactionClient;
  mutationId?: string;
  commandHash?: string;
};

function receiptInput(context: ChartRunContext) {
  return context.mutationId && context.commandHash
    ? { mutationId: context.mutationId, commandHash: context.commandHash }
    : null;
}

async function replayReceipt(context: ChartRunContext) {
  const receipt = receiptInput(context);
  if (!receipt || !context.db) return null;
  return findChartMutationReceipt(context.db, receipt.mutationId, receipt.commandHash);
}

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

  if (context.runId != null) {
    return withUndoTrackedSheetMutationAfterSuccess(
      workspaceId,
      dependencySheetIds([spec]),
      async (tx: Prisma.TransactionClient) => {
        const receipt = receiptInput(context);
        if (receipt) {
          const replay = await findChartMutationReceipt(
            tx,
            receipt.mutationId,
            receipt.commandHash,
          );
          if (replay !== null) return replay;
        }
        const normalizedSpec = await normalizeChartSpecForWorkspace(workspaceId, spec, tx);
        const sheetIds = dependencySheetIds([normalizedSpec]);
        await runRepository.upsertRunChartSnapshotUsing(tx, {
          runId: context.runId as number,
          chartId: normalizedSpec.id,
          workbookId: parseChartRelationId(normalizedSpec.workbookId, "workbookId"),
          sheetId: parseChartRelationId(normalizedSpec.sheetId, "sheetId"),
          sheetIds,
          order: 0,
          spec: null,
        });
        const created = await createChartInTransaction(tx, workspaceId, normalizedSpec);
        if (!created) throw new Error(`Workbook ${normalizedSpec.workbookId} 不存在`);
        if (receipt) {
          await recordChartMutationReceipt(tx, {
            ...receipt,
            mutation: "create",
            chartId: spec.id,
            result: created,
          });
        }
        return created;
      },
      context.runId,
      context.db,
    );
  }

  return withUndoTrackedMutation(
    workspaceId,
    async () => dependencySheetIds([await normalizeChartSpecForWorkspace(workspaceId, spec)]),
    async () => {
      const normalizedSpec = await normalizeChartSpecForWorkspace(workspaceId, spec);
      const result = await persistChart(workspaceId, normalizedSpec);
      if (!result) throw new Error(`Workbook ${normalizedSpec.workbookId} 不存在`);
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
  const replay = await replayReceipt(context);
  if (replay !== null) return replay;
  let previous: ChartSpec | null = null;
  let next: ChartSpec | null = null;
  let previousOrder = 0;

  if (context.runId != null) {
    const current = await getChartRecord(workspaceId, chartId);
    if (!current) throw new ChartMutationNotFoundError(chartId);
    const planned = buildUpdatedChartSpec(current.spec, patch);
    return withUndoTrackedSheetMutationAfterSuccess(
      workspaceId,
      dependencySheetIds([current.spec, planned]),
      async (tx: Prisma.TransactionClient) => {
        const receipt = receiptInput(context);
        if (receipt) {
          const replay = await findChartMutationReceipt(
            tx,
            receipt.mutationId,
            receipt.commandHash,
          );
          if (replay !== null) return replay;
        }
        const current = await getChartRecordInTransaction(tx, workspaceId, chartId);
        if (!current) throw new ChartMutationNotFoundError(chartId);
        const updated = buildUpdatedChartSpec(current.spec, patch);
        const normalizedUpdated = await normalizeChartSpecForWorkspace(workspaceId, updated, tx);
        const sheetIds = dependencySheetIds([current.spec, normalizedUpdated]);
        await runRepository.upsertRunChartSnapshotUsing(tx, {
          runId: context.runId as number,
          chartId: current.spec.id,
          workbookId: parseChartRelationId(current.spec.workbookId, "workbookId"),
          sheetId: parseChartRelationId(current.spec.sheetId, "sheetId"),
          sheetIds,
          order: current.order,
          spec: JSON.stringify(current.spec),
        });
        const result = await updateChartInTransaction(tx, workspaceId, chartId, normalizedUpdated);
        if (!result) throw new ChartMutationNotFoundError(chartId);
        if (receipt) {
          await recordChartMutationReceipt(tx, {
            ...receipt,
            mutation: "update",
            chartId,
            result,
          });
        }
        return result;
      },
      context.runId,
      context.db,
    );
  }

  return withUndoTrackedMutation(
    workspaceId,
    async () => {
      const current = await getChartRecord(workspaceId, chartId);
      if (!current) throw new ChartMutationNotFoundError(chartId);
      previous = current.spec;
      next = await normalizeChartSpecForWorkspace(
        workspaceId,
        buildUpdatedChartSpec(current.spec, patch),
      );
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
  const replay = await replayReceipt(context);
  if (replay !== null) return replay;
  if (context.runId != null) {
    const current = await getChartRecord(workspaceId, chartId);
    if (!current) throw new ChartMutationNotFoundError(chartId);
    return withUndoTrackedSheetMutationAfterSuccess(
      workspaceId,
      dependencySheetIds([current.spec]),
      async (tx: Prisma.TransactionClient) => {
        const receipt = receiptInput(context);
        if (receipt) {
          const replay = await findChartMutationReceipt(
            tx,
            receipt.mutationId,
            receipt.commandHash,
          );
          if (replay !== null) return replay;
        }
        const current = await getChartRecordInTransaction(tx, workspaceId, chartId);
        if (!current) throw new ChartMutationNotFoundError(chartId);
        await runRepository.upsertRunChartSnapshotUsing(tx, {
          runId: context.runId as number,
          chartId: current.spec.id,
          workbookId: parseChartRelationId(current.spec.workbookId, "workbookId"),
          sheetId: parseChartRelationId(current.spec.sheetId, "sheetId"),
          sheetIds: dependencySheetIds([current.spec]),
          order: current.order,
          spec: JSON.stringify(current.spec),
        });
        const deleted = await deleteChartInTransaction(tx, workspaceId, chartId);
        if (!deleted) throw new ChartMutationNotFoundError(chartId);
        const result = { success: true, chartId };
        if (receipt) {
          await recordChartMutationReceipt(tx, {
            ...receipt,
            mutation: "delete",
            chartId,
            result,
          });
        }
        return result;
      },
      context.runId,
      context.db,
    );
  }

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
      const deleted = await persistDeletedChart(workspaceId, chartId);
      if (!deleted) throw new Error(`Chart ${chartId} 不存在`);
      return { success: true, chartId };
    },
    context.runId,
  );
}
