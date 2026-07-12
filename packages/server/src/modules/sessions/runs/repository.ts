import { prisma } from "../../../infra/database/db.js";

const DEFAULT_UNDO_SNAPSHOT_RETENTION = 1;

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

export async function findLatestUndoableRun(workspaceId: number, sessionId: number) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true },
  });
  if (!session) return null;

  return prisma.agentRun.findFirst({
    where: {
      sessionId: session.id,
      status: { in: ["completed", "aborted", "error"] },
      OR: [
        { snapshots: { some: {} } },
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
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
  });
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

export async function pruneUndoSnapshots(
  workspaceId: number,
  sessionId: number,
  keepRuns = DEFAULT_UNDO_SNAPSHOT_RETENTION,
) {
  const session = await prisma.session.findFirst({
    where: { id: sessionId, workspaceId },
    select: { id: true },
  });
  if (!session) return 0;

  const runsWithSnapshots = await prisma.agentRun.findMany({
    where: {
      sessionId: session.id,
      snapshots: { some: {} },
    },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    select: { id: true },
  });

  const staleRunIds = runsWithSnapshots
    .slice(keepRuns)
    .map((run: (typeof runsWithSnapshots)[number]) => run.id);
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
