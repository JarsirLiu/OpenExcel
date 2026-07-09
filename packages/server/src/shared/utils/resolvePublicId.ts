import type { FastifyReply, FastifyRequest } from "fastify";
import { prisma } from "../../infra/database/db.js";
import { requireCurrentUser } from "../../middleware/requestContext.js";
import { requireWorkspace, WorkspaceNotFoundError } from "../../modules/workspaces/service.js";

function isNumeric(value: string): boolean {
  return /^\d+$/.test(value);
}

export async function resolveWorkspaceIdForRequest(
  req: FastifyRequest,
  workspaceIdOrPublicId: string,
  reply: FastifyReply,
): Promise<number | null> {
  const currentUser = requireCurrentUser(req, reply);
  if (!currentUser) return null;

  if (isNumeric(workspaceIdOrPublicId)) {
    try {
      await requireWorkspace(Number(workspaceIdOrPublicId), currentUser.id);
      return Number(workspaceIdOrPublicId);
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        reply.status(404).send({ error: "Workspace not found" });
        return null;
      }
      throw error;
    }
  }

  const workspace = await prisma.workspace.findFirst({
    where: { publicId: workspaceIdOrPublicId, ownerUserId: currentUser.id },
    select: { id: true },
  });
  if (!workspace) {
    reply.status(404).send({ error: "Workspace not found" });
    return null;
  }
  return workspace.id;
}

export async function resolveWorkbookIdForRequest(
  req: FastifyRequest,
  workspaceIdOrPublicId: string,
  workbookIdOrPublicId: string,
  reply: FastifyReply,
): Promise<{ workspaceId: number; workbookId: number } | null> {
  const workspaceId = await resolveWorkspaceIdForRequest(req, workspaceIdOrPublicId, reply);
  if (workspaceId == null) return null;

  if (isNumeric(workbookIdOrPublicId)) {
    const workbook = await prisma.workbook.findFirst({
      where: { id: Number(workbookIdOrPublicId), workspaceId },
      select: { id: true },
    });
    if (!workbook) {
      reply.status(404).send({ error: "Workbook not found" });
      return null;
    }
    return { workspaceId, workbookId: workbook.id };
  }

  const workbook = await prisma.workbook.findFirst({
    where: { publicId: workbookIdOrPublicId, workspaceId },
    select: { id: true },
  });
  if (!workbook) {
    reply.status(404).send({ error: "Workbook not found" });
    return null;
  }
  return { workspaceId, workbookId: workbook.id };
}

export async function resolveSessionIdForRequest(
  req: FastifyRequest,
  workspaceIdOrPublicId: string,
  sessionIdOrPublicId: string,
  reply: FastifyReply,
): Promise<{ workspaceId: number; sessionId: number } | null> {
  const workspaceId = await resolveWorkspaceIdForRequest(req, workspaceIdOrPublicId, reply);
  if (workspaceId == null) return null;

  if (isNumeric(sessionIdOrPublicId)) {
    const session = await prisma.session.findFirst({
      where: { id: Number(sessionIdOrPublicId), workspaceId },
      select: { id: true },
    });
    if (!session) {
      reply.status(404).send({ error: "Session not found" });
      return null;
    }
    return { workspaceId, sessionId: session.id };
  }

  const session = await prisma.session.findFirst({
    where: { publicId: sessionIdOrPublicId, workspaceId },
    select: { id: true },
  });
  if (!session) {
    reply.status(404).send({ error: "Session not found" });
    return null;
  }
  return { workspaceId, sessionId: session.id };
}

export async function resolveSheetIdForRequest(
  req: FastifyRequest,
  workspaceIdOrPublicId: string,
  sheetIdParam: string,
  reply: FastifyReply,
): Promise<{ workspaceId: number; sheetId: number } | null> {
  const workspaceId = await resolveWorkspaceIdForRequest(req, workspaceIdOrPublicId, reply);
  if (workspaceId == null) return null;

  const sheetId = Number(sheetIdParam);
  if (!Number.isInteger(sheetId) || sheetId <= 0) {
    reply.status(400).send({ error: "Invalid sheet id" });
    return null;
  }
  return { workspaceId, sheetId };
}
