import type { FastifyInstance } from "fastify";
import { resolveWorkspaceIdForRequest } from "../../shared/utils/resolvePublicId.js";
import * as service from "./service.js";

export async function documentRoutes(app: FastifyInstance) {
  app.get<{
    Params: { workspacePublicId: string; sheetId: string };
    Querystring: { range?: string };
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId/document/range", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;
    if (!req.query.range) return reply.status(400).send({ error: "Range is required" });

    try {
      const range = service.parseDocumentRange(req.query.range);
      const result = await service.readRange(workspaceId, Number(req.params.sheetId), range);
      if ("error" in result) {
        return reply.status(result.error === "Sheet not found" ? 404 : 400).send(result);
      }
      return result;
    } catch {
      return reply.status(400).send({ error: "Invalid range" });
    }
  });

  app.post<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: unknown;
  }>(
    "/api/workspaces/:workspacePublicId/sheets/:sheetId/document/operations",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;

      const result = await service.applyOperation(
        workspaceId,
        Number(req.params.sheetId),
        req.body,
      );
      if ("error" in result) {
        const status =
          result.error === "Sheet not found"
            ? 404
            : result.error === "Revision conflict" || result.error === "Idempotency key conflict"
              ? 409
              : 400;
        return reply.status(status).send(result);
      }
      return result;
    },
  );

  app.post<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: unknown;
  }>(
    "/api/workspaces/:workspacePublicId/sheets/:sheetId/document/operations/batch",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceIdForRequest(
        req,
        req.params.workspacePublicId,
        reply,
      );
      if (workspaceId == null) return;

      const result = await service.applyOperations(
        workspaceId,
        Number(req.params.sheetId),
        req.body,
      );
      if ("error" in result) {
        const status =
          result.error === "Sheet not found"
            ? 404
            : result.error === "Revision conflict" || result.error === "Idempotency key conflict"
              ? 409
              : 400;
        return reply.status(status).send(result);
      }
      return result;
    },
  );

  app.patch<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: unknown;
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId/document/layout", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;

    const result = await service.applyLayout(workspaceId, Number(req.params.sheetId), req.body);
    if ("error" in result) {
      const status =
        result.error === "Sheet not found" ? 404 : result.error === "Revision conflict" ? 409 : 400;
      return reply.status(status).send(result);
    }
    return result;
  });

  app.post<{
    Params: { workspacePublicId: string; sheetId: string };
    Body: unknown;
  }>("/api/workspaces/:workspacePublicId/sheets/:sheetId/document/compact", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(
      req,
      req.params.workspacePublicId,
      reply,
    );
    if (workspaceId == null) return;

    const result = await service.compactOperations(
      workspaceId,
      Number(req.params.sheetId),
      req.body,
    );
    if ("error" in result) {
      const status =
        result.error === "Sheet not found" ? 404 : result.error === "Revision conflict" ? 409 : 400;
      return reply.status(status).send(result);
    }
    return result;
  });
}
