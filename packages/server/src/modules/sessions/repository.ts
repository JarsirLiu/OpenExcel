import { prisma } from "../../infra/database/db.js";
import { generateSessionPublicId } from "../../shared/utils/publicId.js";

export async function findSessionsByWorkspace(workspaceId: number) {
  return prisma.session.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSession(workspaceId: number, name: string) {
  return prisma.session.create({
    data: { publicId: generateSessionPublicId(), workspaceId, name, sheetId: null },
  });
}

export async function deleteSession(id: number, workspaceId: number) {
  const session = await prisma.session.findFirst({
    where: { id, workspaceId },
  });
  if (!session) return null;
  return prisma.session.delete({ where: { id: session.id } });
}

export async function updateSession(
  id: number,
  data: { name?: string; chatMessages?: string },
  workspaceId: number,
) {
  const session = await prisma.session.findFirst({
    where: { id, workspaceId },
  });
  if (!session) return null;
  return prisma.session.update({ where: { id: session.id }, data });
}

export async function findSession(id: number, workspaceId: number) {
  return prisma.session.findFirst({
    where: { id, workspaceId },
  });
}
