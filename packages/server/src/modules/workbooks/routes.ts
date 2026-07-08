import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { resolveWorkbookIdForRequest, resolveWorkspaceIdForRequest } from "../../shared/utils/resolvePublicId.js";

export async function workbookRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspacePublicId: string } }>("/api/workspaces/:workspacePublicId/workbooks", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    return service.getWorkbooks(workspaceId);
  });

  app.post<{
    Params: { workspacePublicId: string };
    Body: { name?: string; sheetName?: string; sourceSheetId?: number };
  }>("/api/workspaces/:workspacePublicId/workbooks", async (req, reply) => {
    try {
      const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
      if (workspaceId == null) return;
      const result = await service.createWorkbook(workspaceId, req.body.name, req.body.sheetName, req.body.sourceSheetId);
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof service.WorkbookUploadError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
          details: error.details,
        });
      }
      if (error instanceof service.WorkbookCreationError) {
        return reply.status(404).send({
          error: error.message,
          code: "SOURCE_SHEET_NOT_FOUND",
        });
      }
      throw error;
    }
  });

  app.get<{ Params: { workspacePublicId: string } }>("/api/workspaces/:workspacePublicId/workbooks/reference-candidates", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    return service.getReferenceCandidates(workspaceId);
  });

  app.get<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
      if (ids == null) return;
      const wb = await service.getWorkbook(ids.workbookId, ids.workspaceId);
      if (!wb) return reply.status(404).send({ error: "Not found" });
      return wb;
    },
  );

  app.patch<{
    Params: { workspacePublicId: string; workbookPublicId: string };
    Body: { name: string };
  }>("/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId", async (req, reply) => {
    const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
    if (ids == null) return;
    const result = await service.renameWorkbook(ids.workbookId, req.body.name, ids.workspaceId);
    if (!result) return reply.status(404).send({ error: "Not found" });
    return result;
  });

  app.post<{ Params: { workspacePublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/upload",
    async (req, reply) => {
      try {
        const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
        if (workspaceId == null) return;
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: "No file uploaded" });

        const buf = await data.toBuffer();
        const result = await service.uploadAsNewWorkbook(workspaceId, buf, data.filename);
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof service.WorkbookUploadError) {
          return reply.status(error.statusCode).send({
            error: error.message,
            code: error.code,
            details: error.details,
          });
        }
        throw error;
      }
    },
  );

  app.post<{
    Params: { workspacePublicId: string; workbookPublicId: string };
    Body: { name?: string; sourceSheetId?: number };
  }>("/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets", async (req, reply) => {
    try {
      const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
      if (ids == null) return;
      const result = await service.createSheet(
        ids.workspaceId,
        ids.workbookId,
        req.body.name,
        req.body.sourceSheetId,
      );
      if (!result) return reply.status(404).send({ error: "Workbook not found" });
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof service.WorkbookCreationError) {
        return reply.status(404).send({
          error: error.message,
          code: "SOURCE_SHEET_NOT_FOUND",
        });
      }
      throw error;
    }
  });

  app.delete<{
    Params: { workspacePublicId: string; workbookPublicId: string; sheetId: string };
  }>("/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets/:sheetId", async (req, reply) => {
    const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
    if (ids == null) return;
    const result = await service.deleteSheet(ids.workspaceId, ids.workbookId, Number(req.params.sheetId));
    if (!result) return reply.status(404).send({ error: "Workbook not found" });
    if ("error" in result) {
      return reply.status(result.statusCode ?? 500).send({ error: result.error });
    }
    return reply.status(204).send();
  });

  app.delete<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
      if (ids == null) return;
      const result = await service.deleteWorkbook(ids.workspaceId, ids.workbookId);
      if ("error" in result) return reply.status(result.statusCode ?? 404).send(result);
      return result;
    },
  );

  app.get<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/template",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(req, req.params.workspacePublicId, req.params.workbookPublicId, reply);
      if (ids == null) return;
      const buf = await service.exportTemplate(ids.workspaceId, ids.workbookId);
      if (!buf) return reply.status(404).send({ error: "Not found" });

      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="template.xlsx"`);
      return reply.send(buf);
    },
  );
}