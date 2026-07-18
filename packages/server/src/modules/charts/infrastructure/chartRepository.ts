import { type ChartSpec, type ImportedChartInput, materializeImportedChart } from "@openexcel/core";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { generatePublicId } from "../../../shared/utils/publicId.js";
import { ChartValidationError, parseChartRelationId, serializeChartSpec } from "../domain/chart.js";

async function assertChartReferencesBelongToWorkbook(
  tx: Prisma.TransactionClient,
  spec: ChartSpec,
  options: {
    expectedWorkbookId?: number;
    sheetIds?: ReadonlySet<number>;
  } = {},
): Promise<{ workbookId: number; sheetId: number }> {
  const workbookId = parseChartRelationId(spec.workbookId, "workbookId");
  if (options.expectedWorkbookId != null && workbookId !== options.expectedWorkbookId) {
    throw new ChartValidationError("Chart belongs to a different workbook");
  }
  const sheetId = parseChartRelationId(spec.sheetId, "sheetId");
  const sheetIds =
    options.sheetIds ??
    new Set(
      (
        await tx.sheet.findMany({
          where: { workbookId },
          select: { id: true },
        })
      ).map((sheet) => sheet.id),
    );
  const references = spec.series.flatMap((series) => [
    series.valueRef.sheetId,
    series.categoryRef?.sheetId,
    typeof series.name === "object" ? series.name.sheetId : undefined,
  ]);
  const hasExternalReference = references.some(
    (reference) => reference && !sheetIds.has(parseChartRelationId(reference, "sheetId")),
  );
  if (!sheetIds.has(sheetId) || hasExternalReference) {
    throw new ChartValidationError("Chart references a sheet outside its workbook");
  }
  return { workbookId, sheetId };
}

export async function findChartsForWorkbook(workspaceId: number, workbookId: number) {
  return prisma.chart.findMany({
    where: { workbookId, workbook: { workspaceId } },
    orderBy: [{ order: "asc" }, { id: "asc" }],
  });
}

export async function findChart(workspaceId: number, chartId: string) {
  return prisma.chart.findFirst({
    where: { publicId: chartId, workbook: { workspaceId } },
  });
}

export async function createChart(workspaceId: number, spec: ChartSpec) {
  return prisma.$transaction(async (tx) => {
    const workbookId = parseChartRelationId(spec.workbookId, "workbookId");
    const workbook = await tx.workbook.findFirst({
      where: { id: workbookId, workspaceId },
      select: { id: true },
    });
    if (!workbook) return null;

    const { sheetId } = await assertChartReferencesBelongToWorkbook(tx, spec);
    const maxOrder = await tx.chart.aggregate({
      where: { workbookId },
      _max: { order: true },
    });
    return tx.chart.create({
      data: {
        publicId: spec.id,
        workbookId,
        sheetId,
        order: (maxOrder._max.order ?? -1) + 1,
        spec: serializeChartSpec(spec),
      },
    });
  });
}

export async function createChartsInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  workbookId: number,
  specs: readonly ChartSpec[],
) {
  const workbook = await tx.workbook.findFirst({
    where: { id: workbookId, workspaceId },
    select: { id: true },
  });
  if (!workbook) throw new ChartValidationError("Imported workbook does not exist");
  const sheets = await tx.sheet.findMany({
    where: { workbookId },
    select: { id: true },
  });
  const sheetIds = new Set(sheets.map((sheet) => sheet.id));
  const maxOrder = await tx.chart.aggregate({ where: { workbookId }, _max: { order: true } });
  let order = (maxOrder._max.order ?? -1) + 1;
  for (const spec of specs) {
    const { sheetId } = await assertChartReferencesBelongToWorkbook(tx, spec, {
      expectedWorkbookId: workbookId,
      sheetIds,
    });
    await tx.chart.create({
      data: {
        publicId: spec.id,
        workbookId,
        sheetId,
        order,
        spec: serializeChartSpec(spec),
      },
    });
    order += 1;
  }
}

export async function createImportedChartsInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  workbookId: number,
  inputs: readonly ImportedChartInput[],
  sheetIdByKey: ReadonlyMap<string, string>,
) {
  const specs = inputs.map((input) =>
    materializeImportedChart(input, {
      workbookId: String(workbookId),
      chartId: generatePublicId("chart"),
      sheetIdByKey,
    }),
  );
  await createChartsInTransaction(tx, workspaceId, workbookId, specs);
}

export async function updateChart(workspaceId: number, chartId: string, spec: ChartSpec) {
  return prisma.$transaction(async (tx) => {
    const current = await tx.chart.findFirst({
      where: { publicId: chartId, workbook: { workspaceId } },
      select: { id: true, workbookId: true, order: true },
    });
    if (!current) return null;
    if (spec.id !== chartId || spec.workbookId !== String(current.workbookId)) {
      throw new Error("Chart identity cannot change during update");
    }

    const { sheetId } = await assertChartReferencesBelongToWorkbook(tx, spec);
    return tx.chart.update({
      where: { id: current.id },
      data: { sheetId, spec: serializeChartSpec(spec) },
    });
  });
}

export async function deleteChart(workspaceId: number, chartId: string) {
  const current = await findChart(workspaceId, chartId);
  if (!current) return null;
  return prisma.chart.delete({ where: { id: current.id } });
}
