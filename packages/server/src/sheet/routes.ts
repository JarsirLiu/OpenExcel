import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function sheetRoutes(app: FastifyInstance) {
  app.patch<{
    Params: { id: string };
    Body: { celldata: any[][] };
  }>("/api/sheets/:id", async (req, reply) => {
    const result = await service.updateSheetData(Number(req.params.id), req.body.celldata);
    if ("error" in result) return reply.status(400).send(result);
    return result;
  });

  app.get<{ Params: { id: string } }>("/api/sheets/:id", async (req, reply) => {
    const sheet = await service.getSheet(Number(req.params.id));
    if (!sheet) return reply.status(404).send({ error: "Sheet not found" });
    return sheet;
  });
}