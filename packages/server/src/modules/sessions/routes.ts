import type { FastifyInstance } from "fastify";
import { pipeUIMessageStreamToResponse } from "ai";
import * as service from "./service.js";
import { resolveSessionIdForRequest, resolveWorkspaceIdForRequest } from "../../shared/utils/resolvePublicId.js";

export async function sessionRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspacePublicId: string } }>("/api/workspaces/:workspacePublicId/sessions", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    return service.getSessions(workspaceId);
  });

  app.post<{ Params: { workspacePublicId: string } }>("/api/workspaces/:workspacePublicId/sessions", async (req, reply) => {
    const workspaceId = await resolveWorkspaceIdForRequest(req, req.params.workspacePublicId, reply);
    if (workspaceId == null) return;
    const session = await service.createSession(workspaceId);
    return reply.status(201).send(session);
  });

  app.delete<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const deleted = await service.deleteSession(ids.workspaceId, ids.sessionId);
      if (!deleted) return reply.status(404).send({ error: "Session not found" });
      return { success: true };
    },
  );

  app.patch<{ Params: { workspacePublicId: string; sessionPublicId: string }; Body: { name: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const session = await service.renameSession(ids.workspaceId, ids.sessionId, req.body.name);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      return session;
    },
  );

  app.get<{ Params: { workspacePublicId: string; sessionPublicId: string }; Querystring: { limit?: string; offset?: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/messages",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const session = await service.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const limit = Math.min(Number(req.query.limit) || 40, 200);
      const offset = Number(req.query.offset) || 0;
      return service.getMessages(ids.workspaceId, ids.sessionId, limit, offset);
    },
  );

  app.get<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const session = await service.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      return service.getRuns(ids.workspaceId, ids.sessionId);
    },
  );

  app.post<{ Params: { workspacePublicId: string; sessionPublicId: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/runs/undo-latest",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const session = await service.getSession(ids.workspaceId, ids.sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      return service.undoLatestRun(ids.workspaceId, ids.sessionId);
    },
  );

  app.post<{ Params: { workspacePublicId: string; sessionPublicId: string }; Body: { firstUserText: string } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/title",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const sessionId = ids.sessionId;
      const firstUserText = typeof req.body?.firstUserText === "string"
        ? req.body.firstUserText.trim()
        : "";

      if (!firstUserText) {
        return reply.status(400).send({ error: "标题生成需要用户消息" });
      }

      const session = await service.getSession(ids.workspaceId, sessionId);
      if (!session) {
        return reply.status(404).send({ error: "会话不存在" });
      }

      const title = await service.generateSessionTitleForSession(ids.workspaceId, sessionId, firstUserText);
      return { title };
    },
  );

  app.post<{ Params: { workspacePublicId: string; sessionPublicId: string }; Body: { messages: any[] } }>(
    "/api/workspaces/:workspacePublicId/sessions/:sessionPublicId/chat",
    async (req, reply) => {
      const ids = await resolveSessionIdForRequest(req, req.params.workspacePublicId, req.params.sessionPublicId, reply);
      if (ids == null) return;
      const sessionId = ids.sessionId;
      const session = await service.getSession(ids.workspaceId, sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const { messages } = req.body;
      const controller = new AbortController();

      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      });

      reply.hijack();

      const stream = await service.streamChat(ids.workspaceId, sessionId, messages, controller.signal);

      pipeUIMessageStreamToResponse({ response: reply.raw, stream });
    },
  );
}