import type { FastifyReply, FastifyRequest } from "fastify";
import { requireCurrentUser } from "../../middleware/requestContext.js";
import { requireWorkspace, WorkspaceNotFoundError } from "./service.js";

export async function resolveWorkspaceIdForRequest(
  req: FastifyRequest,
  workspaceIdParam: string,
  reply: FastifyReply,
): Promise<number | null> {
  const currentUser = requireCurrentUser(req, reply);
  if (!currentUser) return null;

  const workspaceId = Number(workspaceIdParam);
  if (!Number.isInteger(workspaceId) || workspaceId <= 0) {
    reply.status(400).send({ error: "Invalid workspace id" });
    return null;
  }

  try {
    await requireWorkspace(workspaceId, currentUser.id);
    return workspaceId;
  } catch (error) {
    if (error instanceof WorkspaceNotFoundError) {
      reply.status(404).send({ error: "Workspace not found" });
      return null;
    }
    throw error;
  }
}
