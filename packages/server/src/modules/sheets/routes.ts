import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { resolveWorkspaceIdForRequest as resolveWorkspaceId } from "../workspaces/access.js";

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { workspaceId: string; id: string };
    Body: { celldata: any[]; config?: any };
  }>("/api/workspaces/:workspaceId/sheets/:id", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const result = await service.updateSheetData(workspaceId, Number(req.params.id), req.body.celldata, req.body.config);
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.patch<{
    Params: { workspaceId: string; id: string };
    Body: { name: string };
  }>("/api/workspaces/:workspaceId/sheets/:id/name", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const result = await service.updateSheetName(workspaceId, Number(req.params.id), req.body.name);
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.get<{ Params: { workspaceId: string; id: string } }>("/api/workspaces/:workspaceId/sheets/:id", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const sheet = await service.getSheet(workspaceId, Number(req.params.id));
    if (!sheet) return reply.status(404).send({ error: "Sheet not found" });
    return sheet;
  });
}
