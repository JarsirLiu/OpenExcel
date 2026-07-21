import { prisma } from "../../../infra/database/db.js";

const STALE_RUN_AFTER_MS = 5 * 60 * 1000;

export async function createRun(data: {
  sessionId: number;
  status: string;
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

export function isRunStale(startedAt: Date, now = Date.now()) {
  return now - startedAt.getTime() >= STALE_RUN_AFTER_MS;
}

export async function markRunStale(id: number) {
  return prisma.agentRun.update({
    where: { id },
    data: {
      status: "error",
      errorMessage: "运行超时，服务已回收未完成的运行记录",
      endedAt: new Date(),
    },
  });
}

export async function updateRun(id: number, data: Record<string, unknown>) {
  return prisma.agentRun.update({ where: { id }, data });
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
      status: { in: ["completed", "aborted", "error"] },
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
}) {
  return prisma.agentRunSheetSnapshot.upsert({
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

export async function findRunSheetSnapshot(runId: number, sheetId: number) {
  return prisma.agentRunSheetSnapshot.findUnique({
    where: { runId_sheetId: { runId, sheetId } },
  });
}

export async function deleteRunSheetSnapshot(runId: number, sheetId: number) {
  await prisma.agentRunSheetSnapshot.deleteMany({ where: { runId, sheetId } });
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
  return prisma.$transaction(async (tx) => {
    const existing = await tx.agentRunChartSnapshot.findUnique({
      where: {
        runId_chartId: {
          runId: data.runId,
          chartId: data.chartId,
        },
      },
    });
    if (existing) return existing;

    const snapshot = await tx.agentRunChartSnapshot.create({
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
      await tx.agentRunChartSnapshotSheet.createMany({
        data: sheetIds.map((sheetId) => ({ snapshotId: snapshot.id, sheetId })),
      });
    }
    return snapshot;
  });
}

export async function findRunSheetSnapshots(runId: number) {
  return prisma.agentRunSheetSnapshot.findMany({
    where: { runId },
    orderBy: { id: "asc" },
  });
}

export async function findRunsWithSnapshotsForSheets(
  workspaceId: number,
  sheetIds: number[],
  originRunId?: number,
) {
  if (sheetIds.length === 0) return [];

  const sheetSnapshots = await prisma.agentRunSheetSnapshot.findMany({
    where: {
      sheetId: { in: sheetIds },
      run: {
        undoInvalidated: false,
        status: { in: ["running", "completed", "aborted", "error"] },
        session: { workspaceId },
        ...(originRunId == null ? {} : { id: { not: originRunId } }),
      },
    },
    select: { runId: true },
  });

  const chartSnapshots = await prisma.agentRunChartSnapshotSheet.findMany({
    where: {
      sheetId: { in: sheetIds },
      snapshot: {
        run: {
          undoInvalidated: false,
          status: { in: ["running", "completed", "aborted", "error"] },
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

export async function restoreRunSheetSnapshots(runId: number) {
  const snapshots = await findRunSheetSnapshots(runId);
  if (snapshots.length === 0) {
    throw new Error("当前运行没有可撤销的 Sheet 修改");
  }

  await prisma.$transaction([
    ...snapshots.map((snapshot: (typeof snapshots)[number]) =>
      prisma.sheet.update({
        where: { id: snapshot.sheetId },
        data: {
          uploadedData: snapshot.uploadedData,
          config: snapshot.config,
          revision: { increment: 1 },
        },
      }),
    ),
    prisma.agentRun.update({
      where: { id: runId },
      data: {
        status: "reverted",
        revertedAt: new Date(),
      },
    }),
    prisma.agentRunSheetSnapshot.deleteMany({
      where: { runId },
    }),
  ]);

  return snapshots.map((snapshot: (typeof snapshots)[number]) => snapshot.sheetId);
}
