import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function workspaceRoutes(app: FastifyInstance) {
  app.get("/api/workspaces", async () => {
    return service.getWorkspaces();
  });

  app.post<{ Body: { name?: string } }>("/api/workspaces", async (req, reply) => {
    const workspace = await service.createWorkspace(req.body?.name);
    return reply.status(201).send(workspace);
  });

  app.get<{ Params: { id: string } }>("/api/workspaces/:id", async (req, reply) => {
    const workspace = await service.getWorkspace(Number(req.params.id));
    if (!workspace) return reply.status(404).send({ error: "Workspace not found" });
    return workspace;
  });
}
