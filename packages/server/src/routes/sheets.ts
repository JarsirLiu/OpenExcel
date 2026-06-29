import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

export async function sheetRoutes(app: FastifyInstance) {
  const updateSheetData = async (sheetId: number, celldata: any[][], reply: any) => {
    if (!Array.isArray(celldata)) {
      return reply.status(400).send({ error: "Invalid data format" });
    }

    await prisma.sheet.update({
      where: { id: sheetId },
      data: { uploadedData: JSON.stringify(celldata) },
    });

    return { success: true };
  };

  app.patch<{
    Params: { id: string };
    Body: { celldata: any[][] };
  }>("/api/sheets/:id", async (req, reply) => {
    const sheetId = Number(req.params.id);
    const { celldata } = req.body;
    return updateSheetData(sheetId, celldata, reply);
  });

  app.get<{ Params: { id: string } }>("/api/sheets/:id", async (req, reply) => {
    const sheetId = Number(req.params.id);
    const sheet = await prisma.sheet.findUnique({
      where: { id: sheetId },
    });
    if (!sheet) {
      return reply.status(404).send({ error: "Sheet not found" });
    }
    return {
      id: sheet.id,
      name: sheet.name,
      columns: JSON.parse(sheet.columns),
      merges: JSON.parse(sheet.merges),
      rows: JSON.parse(sheet.rows),
      uploadedData: sheet.uploadedData ? JSON.parse(sheet.uploadedData) : null,
    };
  });
}
