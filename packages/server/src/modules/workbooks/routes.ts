import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { resolveWorkspaceId } from "../workspaces/context.js";

export async function workbookRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspaceId: string } }>("/api/workspaces/:workspaceId/workbooks", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
    if (workspaceId == null) return;
    return service.getWorkbooks(workspaceId);
  });

  app.post<{
    Params: { workspaceId: string };
    Body: { name?: string; sheetName?: string; sourceSheetId?: number };
  }>("/api/workspaces/:workspaceId/workbooks", async (req, reply) => {
    try {
      const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
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

  app.get<{ Params: { workspaceId: string } }>("/api/workspaces/:workspaceId/workbooks/reference-candidates", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
    if (workspaceId == null) return;
    return service.getReferenceCandidates(workspaceId);
  });

  app.get<{ Params: { workspaceId: string; id: string } }>(
    "/api/workspaces/:workspaceId/workbooks/:id",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
      if (workspaceId == null) return;
      const wb = await service.getWorkbook(Number(req.params.id), workspaceId);
      if (!wb) return reply.status(404).send({ error: "Not found" });
      return wb;
    },
  );

  app.post<{ Params: { workspaceId: string; id: string } }>(
    "/api/workspaces/:workspaceId/workbooks/:id/upload",
    async (req, reply) => {
      try {
        const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
        if (workspaceId == null) return;
        const workbookId = Number(req.params.id);
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: "No file uploaded" });

        const buf = await data.toBuffer();
        const result = await service.uploadExcel(workspaceId, workbookId, buf);
        return { success: true, ...result };
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

  app.post<{ Params: { workspaceId: string } }>(
    "/api/workspaces/:workspaceId/workbooks/upload",
    async (req, reply) => {
      try {
        const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
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
    Params: { workspaceId: string; workbookId: string };
    Body: { name?: string; sourceSheetId?: number };
  }>("/api/workspaces/:workspaceId/workbooks/:workbookId/sheets", async (req, reply) => {
    try {
      const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
      if (workspaceId == null) return;
      const result = await service.createSheet(
        workspaceId,
        Number(req.params.workbookId),
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
    Params: { workspaceId: string; workbookId: string; sheetId: string };
  }>("/api/workspaces/:workspaceId/workbooks/:workbookId/sheets/:sheetId", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const result = await service.deleteSheet(workspaceId, Number(req.params.workbookId), Number(req.params.sheetId));
    if (!result) return reply.status(404).send({ error: "Workbook not found" });
    if ("error" in result) {
      return reply.status(result.statusCode ?? 500).send({ error: result.error });
    }
    return reply.status(204).send();
  });

  app.delete<{ Params: { workspaceId: string; id: string } }>("/api/workspaces/:workspaceId/workbooks/:id", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const result = await service.deleteWorkbook(workspaceId, Number(req.params.id));
    if ("error" in result) return reply.status(result.statusCode ?? 404).send(result);
    return result;
  });

  app.get<{ Params: { workspaceId: string; id: string } }>(
    "/api/workspaces/:workspaceId/workbooks/:id/template",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceId(req.params.workspaceId, reply);
      if (workspaceId == null) return;
      const buf = await service.exportTemplate(workspaceId, Number(req.params.id));
      if (!buf) return reply.status(404).send({ error: "Not found" });

      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="template.xlsx"`);
      return reply.send(buf);
    },
  );
}
