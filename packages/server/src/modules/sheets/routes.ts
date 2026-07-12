import type { FastifyInstance } from "fastify";
import { resolveWorkspaceIdForRequest } from "../../shared/utils/resolvePublicId.js";
import * as service from "./service.js";

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: { name: string };
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId/name", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;
    const result = await service.updateSheetName(
      workspaceId,
      Number(req.params.sheetId),
      req.body.name,
    );
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });
}
