import type { FastifyInstance } from "fastify";
import { resolveWorkspaceIdForRequest } from "../../../middleware/resourceAccess.js";
import { WORKBOOK_IMPORT_LIMITS } from "../../workbooks/api/importLimits.js";
import { decompressImportPayload } from "../../workbooks/api/importPayload.js";
import * as application from "../application/index.js";
import { SheetRevisionConflictError } from "../domain/errors.js";

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: { celldata: any[]; baseRevision: number; config?: any };
  }>(
    "/api/workspaces/:workspacePublicId/sheets/:sheetId",
    {
      bodyLimit: WORKBOOK_IMPORT_LIMITS.maxBodyBytes,
      preParsing: decompressImportPayload,
    },
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      try {
        const result = await application.updateSheetData(
          workspaceId,
          Number(req.params.sheetId),
          req.body.celldata,
          req.body.baseRevision,
          req.body.config,
        );
        if ("error" in result) return reply.status(400).send(result);
        return result;
      } catch (error) {
        if (error instanceof SheetRevisionConflictError) {
          return reply.status(409).send({ error: "Sheet 已被其他操作修改" });
        }
        throw error;
      }
    },
  );

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
    const result = await application.renameSheet(
      workspaceId,
      Number(req.params.sheetId),
      req.body.name,
    );
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.get<{ Params: { workspacePublicId: string; sheetId: string } }>(
    "/api/workspaces/:workspacePublicId/sheets/:sheetId",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      const sheet = await application.getSheet(workspaceId, Number(req.params.sheetId));
      if (!sheet) return reply.status(404).send({ error: "Sheet not found" });
      return sheet;
    },
  );
}
