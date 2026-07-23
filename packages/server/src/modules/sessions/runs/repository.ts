import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { assertRunStatusTransition, type RunStatus } from "./status.js";

const STALE_RUN_AFTER_MS = 5 * 60 * 1000;

export type RunSheetSnapshotKind = "created" | "restorable";

export async function createRun(data: {
  sessionId: number;
  status: RunStatus;
  clientRequestId?: string;
  model?: string;
  systemPrompt?: string;
  inputText?: string;
}) {
  return prisma.agentRun.create({ data });
}

export async function findRunByClientRequestId(workspaceId: number, clientRequestId: string) {
  return prisma.agentRun.findFirst({
    where: {
      clientRequestId,
      session: { workspaceId },
    },
    select: { id: true, sessionId: true, status: true },
  });
}

export async function findActiveRun(sessionId: number) {
  return prisma.agentRun.findFirst({
    where: { sessionId, status: "running" },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function findRunForSession(workspaceId: number, sessionId: number, runId: number) {
  return prisma.agentRun.findFirst({
    where: { id: runId, sessionId, session: { workspaceId } },
  });
}

export async function findRunReplaySnapshot(workspaceId: number, sessionId: number, runId: number) {
  return prisma.agentRun.findFirst({
    where: { id: runId, sessionId, session: { workspaceId } },
    select: {
      id: true,
      status: true,
      clientRequestId: true,
      startedAt: true,
      endedAt: true,
      outputText: true,
      errorMessage: true,
      cancelRequestedAt: true,
      lastEventSequence: true,
    },
  });
}

export function isRunStale(startedAt: Date, now = Date.now()) {
  return now - startedAt.getTime() >= STALE_RUN_AFTER_MS;
}

export async function markRunStale(id: number) {
  return transitionRunStatus(id, "recovery_required", {
    errorMessage: "运行超时，服务已回收未完成的运行记录",
    endedAt: new Date(),
  });
}

export async function updateRun(id: number, data: Record<string, unknown>) {
  if (typeof data.status === "string") {
    const current = await prisma.agentRun.findUnique({ where: { id }, select: { status: true } });
    if (!current) return null;
    assertRunStatusTransition(current.status, data.status as RunStatus);
  }
  return prisma.agentRun.update({ where: { id }, data });
}

export async function transitionRunStatus(
  id: number,
  status: RunStatus,
  data: Record<string, unknown> = {},
) {
  return updateRun(id, { ...data, status });
}

export async function requestRunCancellation(id: number) {
  return prisma.agentRun.updateMany({
    where: { id, status: "running", cancelRequestedAt: null },
    data: { cancelRequestedAt: new Date() },
  });
}

export async function isRunCancellationRequested(id: number) {
  const run = await prisma.agentRun.findUnique({
    where: { id },
    select: { cancelRequestedAt: true },
  });
  return run?.cancelRequestedAt != null;
}

export async function findRun(id: number) {
  return prisma.agentRun.findUnique({ where: { id } });
}

export async function findUndoCheckpointRun(workspaceId: number, sessionId: number) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true, undoRunId: true },
  });
  if (!session?.undoRunId) return null;

  return prisma.agentRun.findFirst({
    where: {
      id: session.undoRunId,
      sessionId: session.id,
      status: { in: ["completed", "cancelled", "failed"] },
      OR: [
        { snapshots: { some: {} } },
        { chartSnapshots: { some: {} } },
        {
          steps: {
            some: {
              OR: [
                { toolName: { contains: "createWorkbook" } },
                { toolName: { contains: "createSheet" } },
              ],
            },
          },
        },
      ],
    },
    include: {
      steps: {
        orderBy: { order: "asc" },
      },
      snapshots: {
        orderBy: { id: "asc" },
      },
      chartSnapshots: {
        orderBy: { id: "asc" },
      },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function findRunUndoState(runId: number) {
  const run = await prisma.agentRun.findUnique({
    where: { id: runId },
    select: {
      id: true,
      undoInvalidated: true,
      _count: {
        select: { snapshots: true, chartSnapshots: true },
      },
    },
  });
  if (!run) return null;

  return {
    id: run.id,
    undoInvalidated: run.undoInvalidated,
    hasUndoEffects: run._count.snapshots > 0 || run._count.chartSnapshots > 0,
  };
}

export async function findRunsBySession(workspaceId: number, sessionId: number) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true },
  });
  if (!session) return [];

  return prisma.agentRun.findMany({
    where: { sessionId: session.id },
    orderBy: { startedAt: "asc" },
  });
}

export async function createStep(data: {
  runId: number;
  type: string;
  status: string;
  content?: string | null;
  toolName?: string | null;
  input?: string | null;
  output?: string | null;
  order: number;
}) {
  return prisma.agentStep.create({ data });
}

export async function updateStep(id: number, data: Record<string, unknown>) {
  return prisma.agentStep.update({ where: { id }, data });
}

export async function findStepsByRun(runId: number) {
  return prisma.agentStep.findMany({
    where: { runId },
    orderBy: { order: "asc" },
  });
}

export async function upsertRunSheetSnapshot(data: {
  runId: number;
  sheetId: number;
  uploadedData: string | null;
  config: string | null;
  kind: RunSheetSnapshotKind;
}) {
  return upsertRunSheetSnapshotUsing(prisma, data);
}

type RunSnapshotDatabase = Pick<
  Prisma.TransactionClient,
  "agentRunSheetSnapshot" | "agentRunChartSnapshot" | "agentRunChartSnapshotSheet"
>;

async function upsertRunSheetSnapshotUsing(
  db: RunSnapshotDatabase,
  data: {
    runId: number;
    sheetId: number;
    uploadedData: string | null;
    config: string | null;
    kind: RunSheetSnapshotKind;
  },
) {
  return db.agentRunSheetSnapshot.upsert({
    where: {
      runId_sheetId: {
        runId: data.runId,
        sheetId: data.sheetId,
      },
    },
    create: data,
    update: {},
  });
}

export async function recordRestorableRunSheetSnapshot(
  tx: Prisma.TransactionClient,
  data: {
    runId: number;
    sheetId: number;
    uploadedData: string;
    config: string | null;
    beforeRevision: number;
    afterRevision: number;
  },
) {
  const existing = await tx.agentRunSheetSnapshot.findUnique({
    where: { runId_sheetId: { runId: data.runId, sheetId: data.sheetId } },
  });

  if (existing?.kind === "created") return existing;

  return tx.agentRunSheetSnapshot.upsert({
    where: {
      runId_sheetId: {
        runId: data.runId,
        sheetId: data.sheetId,
      },
    },
    create: { ...data, kind: "restorable" },
    update: {
      afterRevision: data.afterRevision,
    },
  });
}

export async function upsertRunChartSnapshot(data: {
  runId: number;
  chartId: string;
  workbookId: number;
  sheetId: number;
  sheetIds: number[];
  order: number;
  spec: string | null;
}) {
  return prisma.$transaction((tx) => upsertRunChartSnapshotUsing(tx, data));
}

async function upsertRunChartSnapshotUsing(
  db: RunSnapshotDatabase,
  data: {
    runId: number;
    chartId: string;
    workbookId: number;
    sheetId: number;
    sheetIds: number[];
    order: number;
    spec: string | null;
  },
) {
  const existing = await db.agentRunChartSnapshot.findUnique({
    where: {
      runId_chartId: {
        runId: data.runId,
        chartId: data.chartId,
      },
    },
  });
  if (existing) return existing;

  const snapshot = await db.agentRunChartSnapshot.create({
    data: {
      runId: data.runId,
      chartId: data.chartId,
      workbookId: data.workbookId,
      sheetId: data.sheetId,
      order: data.order,
      spec: data.spec,
    },
  });
  const sheetIds = [...new Set(data.sheetIds)];
  if (sheetIds.length > 0) {
    await db.agentRunChartSnapshotSheet.createMany({
      data: sheetIds.map((sheetId) => ({ snapshotId: snapshot.id, sheetId })),
    });
  }
  return snapshot;
}

type SnapshotQueryClient = Pick<
  Prisma.TransactionClient,
  "agentRunSheetSnapshot" | "agentRunChartSnapshotSheet"
>;

async function findRunsWithSnapshotsForSheetsUsing(
  db: SnapshotQueryClient,
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  if (sheetIds.length === 0) return [];

  const sheetSnapshots = await db.agentRunSheetSnapshot.findMany({
    where: {
      sheetId: { in: sheetIds },
      run: {
        undoInvalidated: false,
        status: { in: ["running", "completed", "cancelled", "failed"] },
        session: { workspaceId },
        ...(originRunId == null ? {} : { id: { not: originRunId } }),
      },
    },
    select: { runId: true },
  });

  const chartSnapshots = await db.agentRunChartSnapshotSheet.findMany({
    where: {
      sheetId: { in: sheetIds },
      snapshot: {
        run: {
          undoInvalidated: false,
          status: { in: ["running", "completed", "cancelled", "failed"] },
          session: { workspaceId },
          ...(originRunId == null ? {} : { id: { not: originRunId } }),
        },
      },
    },
    select: { snapshot: { select: { runId: true } } },
  });

  return [
    ...new Set([
      ...sheetSnapshots.map((snapshot) => snapshot.runId),
      ...chartSnapshots.map((snapshot) => snapshot.snapshot.runId),
    ]),
  ];
}

export async function deleteRunSnapshots(runId: number) {
  await prisma.$transaction([
    prisma.agentRunSheetSnapshot.deleteMany({ where: { runId } }),
    prisma.agentRunChartSnapshot.deleteMany({ where: { runId } }),
  ]);
}

export async function findRunsWithSnapshotsForSheetsInTransaction(
  tx: Prisma.TransactionClient,
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  return findRunsWithSnapshotsForSheetsUsing(tx, workspaceId, sheetIds, originRunId);
}
