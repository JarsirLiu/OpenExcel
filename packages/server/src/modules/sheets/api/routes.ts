import type { SheetCommand } from "@openexcel/core";
import type { FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { resolveWorkspaceIdForRequest } from "../../../middleware/resourceAccess.js";
import { withUndoTrackedSheetMutationAfterSuccess } from "../../sessions/runs/undoCheckpoint.js";
import { WORKBOOK_IMPORT_LIMITS } from "../../workbooks/api/importLimits.js";
import { decompressImportPayload } from "../../workbooks/api/importPayload.js";
import * as application from "../application/index.js";
import {
  SheetMutationIdConflictError,
  SheetNotFoundError,
  SheetRevisionConflictError,
} from "../domain/errors.js";

function sendSheetCommandError(
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
  error: unknown,
) {
  if (error instanceof ZodError) {
    return reply.status(400).send({
      error: "Sheet 命令参数无效",
      code: "INVALID_SHEET_COMMAND",
      details: error.issues.slice(0, 10),
    });
  }
  if (error instanceof SheetNotFoundError) {
    return reply.status(404).send({ error: "Sheet not found" });
  }
  if (error instanceof SheetMutationIdConflictError) {
    return reply.status(409).send({ error: "mutationId 已用于其他命令" });
  }
  if (error instanceof SheetRevisionConflictError) {
    return reply.status(409).send({ error: "Sheet 已被其他操作修改" });
  }
  return undefined;
}

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: SheetCommand;
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
        if (req.body?.sheetId !== Number(req.params.sheetId)) {
          return reply.status(400).send({ error: "Sheet ID 不匹配" });
        }
        const result = await withUndoTrackedSheetMutationAfterSuccess(
          workspaceId,
          [req.body.sheetId],
          (tx) => application.executeSheetCommandInTransaction(tx, workspaceId, req.body),
        );
        const { snapshot: _snapshot, ...response } = result;
        return response;
      } catch (error) {
        const response = sendSheetCommandError(reply, error);
        if (response !== undefined) return response;
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
