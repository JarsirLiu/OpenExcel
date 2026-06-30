import { prisma } from "../db.js";

export async function findSessionsBySheet(sheetId: number) {
  return prisma.session.findMany({
    where: { sheetId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSession(sheetId: number, name: string) {
  return prisma.session.create({ data: { sheetId, name } });
}

export async function deleteSession(id: number) {
  return prisma.session.delete({ where: { id } });
}

export async function findSession(id: number) {
  return prisma.session.findUnique({ where: { id } });
}

export async function findMessagesBySession(sessionId: number) {
  return prisma.message.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMessage(sessionId: number, role: string, content: string) {
  return prisma.message.create({ data: { sessionId, role, content } });
}

export async function findSheet(id: number) {
  return prisma.sheet.findUnique({ where: { id } });
}