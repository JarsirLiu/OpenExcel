import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { resolveWorkspaceIdForRequest } from "../../shared/utils/resolvePublicId.js";

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: { celldata: any[]; config?: any };
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    const result = await service.updateSheetData(workspaceId, Number(req.params.sheetId), req.body.celldata, req.body.config);
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: { name: string };
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId/name", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    const result = await service.updateSheetName(workspaceId, Number(req.params.sheetId), req.body.name);
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.get<{ Params: { workspacePublicId: string; sheetId: string } }>("/api/workspaces/:workspacePublicId/sheets/:sheetId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    const sheet = await service.getSheet(workspaceId, Number(req.params.sheetId));
    if (!sheet) return reply.status(404).send({ error: "Sheet not found" });
    return sheet;
  });
}