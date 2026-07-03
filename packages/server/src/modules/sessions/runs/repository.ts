import { prisma } from "../../../db.js";

const DEFAULT_UNDO_SNAPSHOT_RETENTION = 5;

export async function createRun(data: {
  sessionId: number;
  status: string;
  model?: string;
  systemPrompt?: string;
  inputText?: string;
}) {
  return prisma.agentRun.create({ data });
}

export async function updateRun(id: number, data: Record<string, unknown>) {
  return prisma.agentRun.update({ where: { id }, data });
}

export async function findRun(id: number) {
  return prisma.agentRun.findUnique({ where: { id } });
}

export async function findLatestUndoableRun(sessionId: number) {
  return prisma.agentRun.findFirst({
    where: {
      sessionId,
      status: { in: ["completed", "aborted", "error"] },
      snapshots: { some: {} },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
}

export async function findRunsBySession(sessionId: number) {
  return prisma.agentRun.findMany({
    where: { sessionId },
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

export async function findRunSheetSnapshots(runId: number) {
  return prisma.agentRunSheetSnapshot.findMany({
    where: { runId },
    orderBy: { id: "asc" },
  });
}

export async function deleteRunSheetSnapshots(runId: number) {
  await prisma.agentRunSheetSnapshot.deleteMany({
    where: { runId },
  });
}

export async function pruneUndoSnapshots(sessionId: number, keepRuns = DEFAULT_UNDO_SNAPSHOT_RETENTION) {
  const runsWithSnapshots = await prisma.agentRun.findMany({
    where: {
      sessionId,
      snapshots: { some: {} },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const staleRunIds = runsWithSnapshots.slice(keepRuns).map((run: (typeof runsWithSnapshots)[number]) => run.id);
  if (staleRunIds.length === 0) {
    return 0;
  }

  const result = await prisma.agentRunSheetSnapshot.deleteMany({
    where: {
      runId: { in: staleRunIds },
    },
  });

  return result.count;
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
        },
      })),
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
