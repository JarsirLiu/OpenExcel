import type { FastifyReply } from "fastify";
import { WorkspaceNotFoundError, requireWorkspace } from "./service.js";

export async function resolveWorkspaceId(workspaceIdParam: string, reply: FastifyReply): Promise<number | null> {
  const workspaceId = Number(workspaceIdParam);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    reply.status(400).send({ error: "Invalid workspace id" });
    return null;
  }

  try {
    await requireWorkspace(workspaceId);
    return workspaceId;
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      reply.status(404).send({ error: "Workspace not found" });
      return null;
    }
    throw error;
  }
}
