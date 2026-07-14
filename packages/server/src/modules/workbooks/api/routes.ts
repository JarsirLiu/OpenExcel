import type { FastifyInstance } from "fastify";
import {
  resolveWorkbookIdForRequest,
  resolveWorkspaceIdForRequest,
} from "../../../middleware/resourceAccess.js";
import * as application from "../application/index.js";
import { WORKBOOK_UPLOAD_LIMITS } from "./uploadLimits.js";

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
      if (error instanceof application.WorkbookUploadError) {
        return reply.status(error.statusCode).send({
          error: error.message,
          code: error.code,
          details: error.details,
        });
      }
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

  app.post<{ Params: { workspacePublicId: string } }>(
    "/api/workspaces/:workspacePublicId/workbooks/upload",
    async (req, reply) => {
      try {
        const workspaceId = await resolveWorkspaceIdForRequest(
          req,
          req.params.workspacePublicId,
          reply,
        );
        if (workspaceId == null) return;
        const files = [];
        let totalBytes = 0;
        for await (const data of req.files()) {
          const chunks: Buffer[] = [];
          let fileBytes = 0;
          for await (const chunk of data.file) {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            fileBytes += buffer.length;
            totalBytes += buffer.length;
            if (totalBytes > WORKBOOK_UPLOAD_LIMITS.maxTotalBytes) {
              throw new application.WorkbookUploadError(
                "本次上传文件总大小超过限制",
                "UPLOAD_LIMIT_EXCEEDED",
                413,
                { fileName: data.filename, maxTotalBytes: WORKBOOK_UPLOAD_LIMITS.maxTotalBytes },
              );
            }
            chunks.push(buffer);
          }
          if (data.file.truncated) {
            throw new application.WorkbookUploadError(
              "上传文件超过单文件大小限制",
              "UPLOAD_LIMIT_EXCEEDED",
              413,
              { fileName: data.filename, maxFileBytes: WORKBOOK_UPLOAD_LIMITS.maxFileBytes },
            );
          }
          files.push({ buffer: Buffer.concat(chunks, fileBytes), fileName: data.filename });
        }
        if (files.length === 0) return reply.status(400).send({ error: "No file uploaded" });

        const result = await application.uploadAsNewWorkbook(workspaceId, files);
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof application.WorkbookUploadError) {
          return reply.status(error.statusCode).send({
            error: error.message,
            code: error.code,
            details: error.details,
          });
        }
        if (
          typeof error === "object" &&
          error !== null &&
          "statusCode" in error &&
          error.statusCode === 413
        ) {
          return reply.status(413).send({
            error: "上传文件数量或大小超过限制",
            code: "UPLOAD_LIMIT_EXCEEDED",
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
