import { prisma } from "../../../infra/database/db.js";
import { generateSessionPublicId } from "../../../shared/utils/publicId.js";

export async function findSessionsByWorkspace(workspaceId: number) {
  return prisma.session.findMany({
    where: {
      workspaceId,
    },
    select: {
      id: true,
      publicId: true,
      sheetId: true,
      name: true,
      titleStatus: true,
      undoRunId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function createSession(workspaceId: number, name: string) {
  return prisma.session.create({
    data: {
      publicId: generateSessionPublicId(),
      workspaceId,
      name,
      sheetId: null,
    },
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
  data: { name?: string; titleStatus?: string },
  workspaceId: number,
) {
  const session = await prisma.session.findFirst({
    where: { id, workspaceId },
  });
  if (!session) return null;
  return prisma.session.update({ where: { id: session.id }, data });
}

export async function updateSessionNameIfUnchanged(
  id: number,
  workspaceId: number,
  expectedNames: string[],
  name: string,
) {
  const result = await prisma.session.updateMany({
    where: {
      id,
      workspaceId,
      name: { in: expectedNames },
      titleStatus: { not: "manual" },
    },
    data: { name, titleStatus: "generated" },
  });
  return result.count > 0;
}

export async function prepareSessionTitle(id: number, workspaceId: number, fallbackName: string) {
  const result = await prisma.session.updateMany({
    where: {
      id,
      workspaceId,
      name: "新对话",
      titleStatus: { not: "manual" },
    },
    data: { name: fallbackName, titleStatus: "pending" },
  });
  return result.count > 0;
}

export async function finalizeSessionTitleFallback(
  id: number,
  workspaceId: number,
  fallbackName: string,
) {
  const result = await prisma.session.updateMany({
    where: {
      id,
      workspaceId,
      name: { in: ["新对话", fallbackName] },
      titleStatus: "pending",
    },
    data: { name: fallbackName, titleStatus: "generated" },
  });
  return result.count > 0;
}

export async function findSession(id: number, workspaceId: number) {
  return prisma.session.findFirst({
    where: { id, workspaceId },
  });
}

export async function findSessionUndoCheckpoint(id: number, workspaceId: number) {
  return prisma.session.findFirst({
    where: { id, workspaceId },
    select: { id: true, undoRunId: true },
  });
}

export async function setSessionUndoRun(
  sessionId: number,
  workspaceId: number,
  undoRunId: number,
  sessionVersion?: number,
) {
  const result = await prisma.session.updateMany({
    where: {
      id: sessionId,
      workspaceId,
      ...(sessionVersion == null ? {} : { version: sessionVersion }),
    },
    data: { undoRunId },
  });
  return result.count === 1;
}
