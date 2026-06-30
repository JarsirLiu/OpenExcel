import { prisma } from "../../db.js";

export async function findMessagesBySheet(sheetId: number) {
  return prisma.message.findMany({
    where: { sheetId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createMessage(sheetId: number, role: string, content: string) {
  return prisma.message.create({ data: { sheetId, role, content } });
}

export async function findSheet(id: number) {
  return prisma.sheet.findUnique({ where: { id } });
}