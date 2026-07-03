import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { generateSessionTitle } from "./title.js";
import { pipeUIMessageStreamToResponse } from "ai";

export async function chatRoutes(app: FastifyInstance) {
  app.get("/api/sessions", async () => {
    return service.getSessions();
  });

  app.post("/api/sessions", async (_req, reply) => {
    const session = await service.createSession();
    return reply.status(201).send(session);
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    await service.deleteSession(Number(req.params.id));
    return { success: true };
  });

  app.patch<{ Params: { id: string }; Body: { name: string } }>("/api/sessions/:id", async (req, reply) => {
    const session = await service.renameSession(Number(req.params.id), req.body.name);
    return session;
  });

  app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/messages", async (req) => {
    return service.getMessages(Number(req.params.sessionId));
  });

  app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/runs", async (req) => {
    return service.getRuns(Number(req.params.sessionId));
  });

  app.post<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/runs/undo-latest", async (req) => {
    return service.undoLatestRun(Number(req.params.sessionId));
  });

  app.post<{ Params: { sessionId: string }; Body: { firstUserText: string } }>(
    "/api/sessions/:sessionId/title",
    async (req, reply) => {
      const sessionId = Number(req.params.sessionId);
      const firstUserText = typeof req.body?.firstUserText === "string"
        ? req.body.firstUserText.trim()
        : "";

      if (!firstUserText) {
        return reply.status(400).send({ error: "标题生成需要用户消息" });
      }

      const session = await service.getSession(sessionId);
      if (!session) {
        return reply.status(404).send({ error: "会话不存在" });
      }

      if (session.name !== "新对话") {
        return { title: session.name };
      }

      const title = await generateSessionTitle(
        (id, data) => service.renameSession(id, data.name ?? ""),
        sessionId,
        firstUserText,
      );

      return { title };
    },
  );

  app.post<{ Params: { sessionId: string }; Body: { messages: any[] } }>(
    "/api/sessions/:sessionId/chat",
    async (req, reply) => {
      const sessionId = Number(req.params.sessionId);
      const { messages } = req.body;
      const controller = new AbortController();

      reply.raw.on("close", () => {
        if (!reply.raw.writableEnded) {
          controller.abort();
        }
      });

      reply.hijack();

      const stream = await service.streamChat(sessionId, messages, controller.signal);

      pipeUIMessageStreamToResponse({ response: reply.raw, stream });
    },
  );
}
