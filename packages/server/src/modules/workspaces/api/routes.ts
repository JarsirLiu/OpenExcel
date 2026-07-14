import type { FastifyInstance } from "fastify";
import { requireCurrentUser } from "../../../middleware/requestContext.js";
import { resolveWorkspaceIdForRequest } from "../../../middleware/resourceAccess.js";
import * as application from "../application/index.js";
import { WorkspaceNotFoundError } from "../domain/workspaceErrors.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/api/workspaces", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    return application.listWorkspaces(currentUser.id);
  });

  app.post("/api/workspaces/bootstrap", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    const workspace = await application.bootstrapWorkspace(currentUser.id);
    if (!workspace) {
      return reply.status(503).send({ error: "Unable to initialize workspace" });
    }
    return workspace;
  });

  app.post<{ Body: { name?: string } }>("/api/workspaces", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    const workspace = await application.createWorkspace(currentUser.id, req.body?.name);
    return reply.status(201).send(workspace);
  });

  app.get<{ Params: { publicId: string } }>("/api/workspaces/:publicId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.publicId, reply);
    if (workspaceId == null) return;
    const workspace = await application.getWorkspaceById(workspaceId);
    if (!workspace) return reply.status(404).send({ error: "Workspace not found" });
    return workspace;
  });

  app.patch<{ Params: { publicId: string }; Body: { name: string } }>(
    "/api/workspaces/:publicId",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.publicId, reply);
      if (workspaceId == null) return;
      const currentUser = requireCurrentUser(req, reply);
      if (!currentUser) return;
      try {
        const workspace = await application.renameWorkspace(
          workspaceId,
          currentUser.id,
          req.body.name,
        );
        return workspace;
      } catch (error) {
        if (error instanceof WorkspaceNotFoundError) {
          return reply.status(error.statusCode).send({ error: error.message });
        }
        throw error;
      }
    },
  );

  app.delete<{ Params: { publicId: string } }>("/api/workspaces/:publicId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.publicId, reply);
    if (workspaceId == null) return;
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    try {
      const result = await application.deleteWorkspace(workspaceId, currentUser.id);
      return result;
    } catch (error) {
      if (error instanceof WorkspaceNotFoundError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });
}
