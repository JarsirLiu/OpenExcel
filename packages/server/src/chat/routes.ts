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

    const { result } = await service.chat(sheetId, incomingMessages);

    reply.raw.writeHead(200, {
      "Content-Type": "text/plain",
      "Transfer-Encoding": "chunked",
    });

    for await (const chunk of result.textStream) {
      reply.raw.write(chunk);
    }
    reply.raw.end();
  });
}