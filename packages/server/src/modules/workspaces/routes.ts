import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { requireCurrentUser } from "../../infra/requestContext.js";

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
}
