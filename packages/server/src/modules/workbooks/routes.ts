import type { FastifyInstance } from "fastify";
import * as service from "./service.js";

export async function workbookRoutes(app: FastifyInstance) {
  app.get("/api/workbooks", async () => {
    return service.getWorkbooks();
  });

  app.get("/api/workbooks/reference-candidates", async () => {
    return service.getReferenceCandidates();
  });

  app.get<{ Params: { id: string } }>("/api/workbooks/:id", async (req) => {
    const wb = await service.getWorkbook(Number(req.params.id));
    if (!wb) return { error: "Not found" };
    return wb;
  });

  app.post<{ Params: { id: string } }>(
    "/api/workbooks/:id/upload",
    async (req, reply) => {
      try {
        const workbookId = Number(req.params.id);
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: "No file uploaded" });

        const buf = await data.toBuffer();
        const result = await service.uploadExcel(workbookId, buf);
        return { success: true, ...result };
      } catch (error) {
        if (error instanceof service.WorkbookUploadError) {
          return reply.status(error.statusCode).send({
            error: error.message,
            code: error.code,
            details: error.details,
          });
        }
        throw error;
      }
    },
  );

  app.post(
    "/api/workbooks/upload",
    async (req, reply) => {
      try {
        const data = await req.file();
        if (!data) return reply.status(400).send({ error: "No file uploaded" });

        const buf = await data.toBuffer();
        const result = await service.uploadAsNewWorkbook(buf, data.filename);
        return reply.status(201).send(result);
      } catch (error) {
        if (error instanceof service.WorkbookUploadError) {
          return reply.status(error.statusCode).send({
            error: error.message,
            code: error.code,
            details: error.details,
          });
        }
        throw error;
      }
    },
  );

  app.post<{
    Params: { id: string };
    Body: { name?: string; sourceSheetId?: number };
  }>("/api/workbooks/:id/sheets", async (req, reply) => {
    const result = await service.createSheet(
      Number(req.params.id),
      req.body.name,
      req.body.sourceSheetId,
    );
    if (!result) return reply.status(404).send({ error: "Workbook not found" });
    return reply.status(201).send(result);
  });

  app.delete<{ Params: { id: string } }>("/api/workbooks/:id", async (req, reply) => {
    const result = await service.deleteWorkbook(Number(req.params.id));
    if ("error" in result) return reply.status(404).send(result);
    return result;
  });

  app.get<{ Params: { id: string } }>(
    "/api/workbooks/:id/template",
    async (req, reply) => {
      const buf = await service.exportTemplate(Number(req.params.id));
      if (!buf) return reply.status(404).send({ error: "Not found" });

      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="template.xlsx"`);
      return reply.send(buf);
    },
  );
}
