import { prisma } from "../../db.js";

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

export async function updateSession(id: number, data: { name?: string; chatMessages?: string }) {
  return prisma.session.update({ where: { id }, data });
}

export async function findSession(id: number) {
  return prisma.session.findUnique({ where: { id } });
}
