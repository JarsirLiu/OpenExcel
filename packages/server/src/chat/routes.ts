import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { sheetId: string } }>("/api/sheets/:sheetId/messages", async (req) => {
    return service.getMessages(Number(req.params.sheetId));
  });

  app.post<{
    Params: { sheetId: string };
    Body: { messages: any[] };
  }>("/api/sheets/:sheetId/chat", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const { messages: incomingMessages } = req.body;

    const resultObj = await service.chat(sheetId, incomingMessages);
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