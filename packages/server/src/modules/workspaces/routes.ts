import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { requireCurrentUser } from "../../middleware/requestContext.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/api/workspaces", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    return service.getWorkspaces(currentUser.id);
  });

  app.post<{ Body: { name?: string } }>("/api/workspaces", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    const workspace = await service.createWorkspace(currentUser.id, req.body?.name);
    return reply.status(201).send(workspace);
  });

  app.get<{ Params: { id: string } }>("/api/workspaces/:id", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    const workspace = await service.getWorkspace(Number(req.params.id), currentUser.id);
    if (!workspace) return reply.status(404).send({ error: "Workspace not found" });
    return workspace;
  });

  app.patch<{ Params: { id: string }; Body: { name: string } }>("/api/workspaces/:id", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    try {
      const workspace = await service.renameWorkspace(Number(req.params.id), currentUser.id, req.body.name);
      return workspace;
    } catch (error) {
      if (error instanceof service.WorkspaceNotFoundError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });

  app.delete<{ Params: { id: string } }>("/api/workspaces/:id", async (req, reply) => {
    const currentUser = requireCurrentUser(req, reply);
    if (!currentUser) return;
    try {
      const result = await service.deleteWorkspace(Number(req.params.id), currentUser.id);
      return result;
    } catch (error) {
      if (error instanceof service.WorkspaceNotFoundError) {
        return reply.status(error.statusCode).send({ error: error.message });
      }
      throw error;
    }
  });
}
