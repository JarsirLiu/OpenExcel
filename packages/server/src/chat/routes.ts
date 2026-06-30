import type { FastifyInstance } from "fastify";
import * as service from "./service.js";
import { createPush } from "./stream.js";

export async function chatRoutes(app: FastifyInstance) {
  app.get("/api/chat/sessions", async () => {
    return service.getSessions();
  });

  app.post("/api/chat/sessions", async (_req, reply) => {
    const session = await service.createSession();
    return reply.status(201).send(session);
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    await service.deleteSession(Number(req.params.id));
    return { success: true };
  });

  app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/messages", async (req) => {
    return service.getMessages(Number(req.params.sessionId));
  });

  app.post<{ Params: { sessionId: string }; Body: { input: string } }>("/api/sessions/:sessionId/chat", async (req, reply) => {
    const sessionId = Number(req.params.sessionId);
    const { input } = req.body;
    const controller = new AbortController();
    const push = createPush(reply);

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        controller.abort();
      }
    });

    try {
      await service.chat(sessionId, input, controller.signal, push);
      reply.raw.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      push("run.failed", { error: msg, runId: undefined });
      reply.raw.end();
    }
  });
}
