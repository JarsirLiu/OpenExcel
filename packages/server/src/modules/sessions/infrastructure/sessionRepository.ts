import { prisma } from "../../../infra/database/db.js";
import { generateSessionPublicId } from "../../../shared/utils/publicId.js";

export async function findSessionsByWorkspace(workspaceId: number) {
  return prisma.session.findMany({
    where: {
      workspaceId,
      chatMessages: { not: "[]" },
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

export async function createSession(workspaceId: number, name: string, chatMessages = "[]") {
  return prisma.session.create({
    data: {
      publicId: generateSessionPublicId(),
      workspaceId,
      name,
      sheetId: null,
      chatMessages,
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
  data: { name?: string; titleStatus?: string; chatMessages?: string },
  workspaceId: number,
) {
  const session = await prisma.session.findFirst({
    where: { id, workspaceId },
  });
  if (!session) return null;
  return prisma.session.update({ where: { id: session.id }, data });
}

export async function updateSessionMessagesWithLease(data: {
  workspaceId: number;
  sessionId: number;
  ownerId: string;
  sessionVersion: number;
  chatMessages: string;
}) {
  const result = await prisma.session.updateMany({
    where: {
      id: data.sessionId,
      workspaceId: data.workspaceId,
      leaseOwnerId: data.ownerId,
      version: data.sessionVersion,
    },
    data: { chatMessages: data.chatMessages },
  });
  return result.count === 1;
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
      titleStatus: "pending",
    },
    data: { name, titleStatus: "generated" },
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
