import type { FastifyInstance } from "fastify";
import { pipeUIMessageStreamToResponse } from "ai";
import * as service from "./service.js";
import { resolveWorkspaceIdForRequest as resolveWorkspaceId } from "../workspaces/access.js";

export async function sessionRoutes(app: FastifyInstance) {
  app.get<{ Params: { workspaceId: string } }>("/api/workspaces/:workspaceId/sessions", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    return service.getSessions(workspaceId);
  });

  app.post<{ Params: { workspaceId: string } }>("/api/workspaces/:workspaceId/sessions", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const session = await service.createSession(workspaceId);
    return reply.status(201).send(session);
  });

  app.delete<{ Params: { workspaceId: string; id: string } }>("/api/workspaces/:workspaceId/sessions/:id", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const deleted = await service.deleteSession(workspaceId, Number(req.params.id));
    if (!deleted) return reply.status(404).send({ error: "Session not found" });
    return { success: true };
  });

  app.patch<{ Params: { workspaceId: string; id: string }; Body: { name: string } }>("/api/workspaces/:workspaceId/sessions/:id", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const session = await service.renameSession(workspaceId, Number(req.params.id), req.body.name);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return session;
  });

  app.get<{ Params: { workspaceId: string; sessionId: string } }>("/api/workspaces/:workspaceId/sessions/:sessionId/messages", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const session = await service.getSession(workspaceId, Number(req.params.sessionId));
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return service.getMessages(workspaceId, Number(req.params.sessionId));
  });

  app.get<{ Params: { workspaceId: string; sessionId: string } }>("/api/workspaces/:workspaceId/sessions/:sessionId/runs", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const session = await service.getSession(workspaceId, Number(req.params.sessionId));
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return service.getRuns(workspaceId, Number(req.params.sessionId));
  });

  app.post<{ Params: { workspaceId: string; sessionId: string } }>("/api/workspaces/:workspaceId/sessions/:sessionId/runs/undo-latest", async (req, reply) => {
    const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
    if (workspaceId == null) return;
    const sessionId = Number(req.params.sessionId);
    const session = await service.getSession(workspaceId, sessionId);
    if (!session) return reply.status(404).send({ error: "Session not found" });
    return service.undoLatestRun(workspaceId, sessionId);
  });

  app.post<{ Params: { workspaceId: string; sessionId: string }; Body: { firstUserText: string } }>(
    "/api/workspaces/:workspaceId/sessions/:sessionId/title",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
      if (workspaceId == null) return;
      const sessionId = Number(req.params.sessionId);
      const firstUserText = typeof req.body?.firstUserText === "string"
        ? req.body.firstUserText.trim()
        : "";

      if (!firstUserText) {
        return reply.status(400).send({ error: "标题生成需要用户消息" });
      }

      const session = await service.getSession(workspaceId, sessionId);
      if (!session) {
        return reply.status(404).send({ error: "会话不存在" });
      }

      const title = await service.generateSessionTitleForSession(workspaceId, sessionId, firstUserText);
      return { title };
    },
  );

  app.post<{ Params: { workspaceId: string; sessionId: string }; Body: { messages: any[] } }>(
    "/api/workspaces/:workspaceId/sessions/:sessionId/chat",
    async (req, reply) => {
      const workspaceId = await resolveWorkspaceId(req, req.params.workspaceId, reply);
      if (workspaceId == null) return;
      const sessionId = Number(req.params.sessionId);
      const session = await service.getSession(workspaceId, sessionId);
      if (!session) return reply.status(404).send({ error: "Session not found" });
      const { messages } = req.body;
      const controller = new AbortController();

      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      });

      reply.hijack();

      const stream = await service.streamChat(workspaceId, sessionId, messages, controller.signal);

      pipeUIMessageStreamToResponse({ response: reply.raw, stream });
    },
  );
}
