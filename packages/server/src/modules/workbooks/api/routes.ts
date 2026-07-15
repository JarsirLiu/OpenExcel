import type { ImportedWorkbookBatchInput } from "@openexcel/core";
import type { FastifyInstance } from "fastify";
import {
  resolveWorkbookIdForRequest,
  resolveWorkspaceIdForRequest,
} from "../../../middleware/resourceAccess.js";
import * as application from "../application/index.js";
import { WORKBOOK_IMPORT_LIMITS } from "./importLimits.js";
import { decompressImportPayload } from "./importPayload.js";

export async function workbookRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspacePublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      return application.getWorkbooks(workspaceId);
    },
  );

  app.post<{
    Params: { workspacePublicId: string };
    Body: { name?: string; sheetName?: string; sourceSheetId?: number };
  }>("/api/workspaces/:workspacePublicId/workbooks", async (req, reply) => {
    try {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      const result = await application.createWorkbook(
        workspaceId,
        req.body.name,
        req.body.sheetName,
        req.body.sourceSheetId,
      );
      return reply.status(201).send(result);
    } catch (error) {
      if (error instanceof application.WorkbookCreationError) {
        return reply.status(404).send({
          error: error.message,
          code: "SOURCE_SHEET_NOT_FOUND",
        });
      }
      throw error;
    }
  });

  app.get<{ Params: { workspacePublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/reference-candidates",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;
      return application.getReferenceCandidates(workspaceId);
    },
  );

  app.get<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;
      const wb = await application.getWorkbook(ids.workbookId, ids.workspaceId);
      if (!wb) return reply.status(404).send({ error: "Not found" });
      return wb;
    },
  );

  app.patch<{
    Params: { workspacePublicId: string; workbookPublicId: string };
    Body: { name: string };
  }>("/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId", async (req, reply) => {
    const ids = await resolveWorkbookIdForRequest(
      req,
      req.params.workspacePublicId,
      req.params.workbookPublicId,
      reply,
    );
    if (ids == null) return;
    const result = await application.renameWorkbook(ids.workbookId, req.body.name, ids.workspaceId);
    if (!result) return reply.status(404).send({ error: "Not found" });
    return result;
  });

  app.post<{
    Params: { workspacePublicId: string };
    Body: ImportedWorkbookBatchInput;
  }>(
    "/api/workspaces/:workspacePublicId/workbooks/import",
    {
      bodyLimit: WORKBOOK_IMPORT_LIMITS.maxBodyBytes,
      preParsing: decompressImportPayload,
    },
    async (req, reply) => {
      try {
        const workspaceId = await resolveWorkspaceIdForRequest(
          req,
          req.params.workspacePublicId,
          reply,
        );
        if (workspaceId == null) return;
        const result = await application.importWorkbooks(workspaceId, req.body);
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof application.WorkbookImportError) {
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
  }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets",
    async (req, reply) => {
      try {
        const ids = await resolveWorkbookIdForRequest(
          req,
          req.params.workspacePublicId,
          req.params.workbookPublicId,
          reply,
        );
        if (ids == null) return;
        const result = await application.createSheet(
          ids.workspaceId,
          ids.workbookId,
          req.body.name,
          req.body.sourceSheetId,
        );
        if (!result) return reply.status(404).send({ error: "Workbook not found" });
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof application.WorkbookCreationError) {
          return reply.status(404).send({
            error: error.message,
            code: "SOURCE_SHEET_NOT_FOUND",
          });
        }
        throw error;
      }
    },
  );

  app.delete<{
    Params: { workspacePublicId: string; workbookPublicId: string; sheetId: string };
  }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/sheets/:sheetId",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;
      const result = await application.deleteSheet(
        ids.workspaceId,
        ids.workbookId,
        Number(req.params.sheetId),
      );
      if (!result) return reply.status(404).send({ error: "Workbook not found" });
      if ("error" in result) {
        return reply.status(result.statusCode ?? 500).send({ error: result.error });
      }
      return reply.status(204).send();
    },
  );

  app.delete<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;
      const result = await application.deleteWorkbook(ids.workspaceId, ids.workbookId);
      if ("error" in result) return reply.status(result.statusCode ?? 404).send(result);
      return result;
    },
  );

  app.get<{ Params: { workspacePublicId: string; workbookPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/:workbookPublicId/template",
    async (req, reply) => {
      const ids = await resolveWorkbookIdForRequest(
        req,
        req.params.workspacePublicId,
        req.params.workbookPublicId,
        reply,
      );
      if (ids == null) return;
      const result = await application.exportWorkbook(ids.workspaceId, ids.workbookId);
      if (!result) return reply.status(404).send({ error: "Not found" });

      const { buffer, name } = result;
      reply.header(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      reply.header(
        "Content-Disposition",
        `attachment; filename="${encodeURIComponent(name)}.xlsx"`,
      );
      return reply.send(buffer);
    },
  );
}
