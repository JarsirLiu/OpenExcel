import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function chatRoutes(app: FastifyInstance) {
  // Sessions
  app.get<{ Params: { sheetId: string } }>("/api/sheets/:sheetId/sessions", async (req) => {
    return service.getSessions(Number(req.params.sheetId));
  });

  app.post<{ Params: { sheetId: string } }>("/api/sheets/:sheetId/sessions", async (req, reply) => {
    const session = await service.createSession(Number(req.params.sheetId));
    return reply.status(201).send(session);
  });

  app.delete<{ Params: { id: string } }>("/api/sessions/:id", async (req, reply) => {
    await service.deleteSession(Number(req.params.id));
    return { success: true };
  });

  // Messages
  app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/messages", async (req) => {
    return service.getMessages(Number(req.params.sessionId));
  });

  // Chat
  app.post<{
    Params: { sessionId: string };
    Body: { messages: any[] };
  }>("/api/sessions/:sessionId/chat", async (req, reply) => {
    const sessionId = Number(req.params.sessionId);
    const { messages: incomingMessages } = req.body;

    const resultObj = await service.chat(sessionId, incomingMessages);
    if ("error" in resultObj) {
      return reply.status(404).send({ error: resultObj.error });
    }

    const { result } = resultObj;

    reply.raw.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
    });

    try {
      for await (const chunk of result.textStream) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI 流式输出失败:", msg);
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: `AI 调用失败: ${msg}` });
      } else {
        reply.raw.end();
      }
    }
  });
}