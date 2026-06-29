import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import * as XLSX from "xlsx";
import { templateToExcel, excelToGrid } from "@openexcel/core";

interface SheetJson {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  rows: string[][];
  uploadedData: string[][] | null;
}

export async function workbookRoutes(app: FastifyInstance) {

  app.get("/api/workbooks", async () => {
    const wbs = await prisma.workbook.findMany({ orderBy: { order: "asc" } });
    return wbs;
  });

  app.get<{ Params: { id: string } }>("/api/workbooks/:id", async (req) => {
    const id = Number(req.params.id);
    const wb = await prisma.workbook.findUnique({
      where: { id },
      include: { sheets: { orderBy: { order: "asc" } } },
    });
    if (!wb) return { error: "Not found" };

    const sheets: SheetJson[] = wb.sheets.map((s) => ({
      id: s.id,
      name: s.name,
      columns: JSON.parse(s.columns),
      merges: JSON.parse(s.merges),
      rows: JSON.parse(s.rows),
      uploadedData: s.uploadedData ? JSON.parse(s.uploadedData) : null,
    }));

    return { id: wb.id, name: wb.name, sheets };
  });

  app.post<{ Params: { id: string } }>(
    "/api/workbooks/:id/upload",
    async (req, reply) => {
      const workbookId = Number(req.params.id);

      const data = await req.file();
      if (!data) return reply.status(400).send({ error: "No file uploaded" });

      const buf = await data.toBuffer();
      const wbFile = XLSX.read(buf, { type: "buffer" });

      const sheets = await prisma.sheet.findMany({
        where: { workbookId },
        orderBy: { order: "asc" },
      });

      const grid = excelToGrid(wbFile, sheets.map((s) => s.name));

      for (let i = 0; i < sheets.length; i++) {
        const sheetData = grid[i] ?? [];
        await prisma.sheet.update({
          where: { id: sheets[i].id },
          data: { uploadedData: JSON.stringify(sheetData) },
        });
      }

      return { success: true, sheets: sheets.length };
    }
  );

  app.get<{ Params: { id: string } }>(
    "/api/workbooks/:id/template",
    async (req, reply) => {
      const id = Number(req.params.id);
      const wb = await prisma.workbook.findUnique({
        where: { id },
        include: { sheets: { orderBy: { order: "asc" } } },
      });
      if (!wb) return reply.status(404).send({ error: "Not found" });

      const sheets = wb.sheets.map((s) => ({
        name: s.name,
        columns: JSON.parse(s.columns) as { label: string; width?: number }[],
        rows: JSON.parse(s.rows) as string[][],
        merges: JSON.parse(s.merges) as { row: [number, number]; col: [number, number] }[],
      }));

      const buf = templateToExcel({ id: "export", name: wb.name, groups: [], sheets });
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="${wb.name}.xlsx"`);
      return reply.send(buf);
    }
  );
}
