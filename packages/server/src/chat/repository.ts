import { prisma } from "../db.js";

export async function findGlobalSessions() {
  return prisma.session.findMany({
    orderBy: { createdAt: "desc" },
  });
}

export async function createSession(name: string) {
  return prisma.session.create({ data: { name, sheetId: null } });
}

export async function ensureGlobalSession() {
  const existing = await prisma.session.findFirst({ orderBy: { createdAt: "asc" } });
  if (existing) return existing;
  return createSession("全局对话");
}

export async function deleteSession(id: number) {
  return prisma.session.delete({ where: { id } });
}

export async function findSession(id: number) {
  return prisma.session.findUnique({ where: { id } });
}

export async function findSheet(id: number) {
  return prisma.sheet.findUnique({ where: { id } });
}

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
