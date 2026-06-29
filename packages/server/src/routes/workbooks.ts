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
  const parseJson = <T,>(value: string, fallback: T): T => {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  };

  const cloneSheetSchema = (sheet: { columns: string; merges: string; rows: string }) => {
    const columns = parseJson<{ label: string; width?: number }[]>(sheet.columns, []);
    const merges = parseJson<{ row: [number, number]; col: [number, number] }[]>(sheet.merges, []);
    const rows = parseJson<string[][]>(sheet.rows, []);

    return {
      columns: JSON.stringify(columns),
      merges: JSON.stringify(merges),
      rows: JSON.stringify(rows.map((row) => row.map(() => ""))),
    };
  };

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

  app.post<{
    Params: { id: string };
    Body: { name?: string; sourceSheetId?: number };
  }>("/api/workbooks/:id/sheets", async (req, reply) => {
    const workbookId = Number(req.params.id);
    const workbook = await prisma.workbook.findUnique({
      where: { id: workbookId },
      include: { sheets: { orderBy: { order: "asc" } } },
    });

    if (!workbook) return reply.status(404).send({ error: "Workbook not found" });

    const sourceSheet = req.body.sourceSheetId
      ? workbook.sheets.find((sheet) => sheet.id === req.body.sourceSheetId)
      : workbook.sheets[workbook.sheets.length - 1];

    const nextOrder = workbook.sheets.length;
    const nextName = req.body.name?.trim() || `Sheet${nextOrder + 1}`;
    const schema = sourceSheet
      ? cloneSheetSchema(sourceSheet)
      : {
          columns: JSON.stringify([{ label: "A" }]),
          merges: JSON.stringify([]),
          rows: JSON.stringify([[]]),
        };

    const sheet = await prisma.sheet.create({
      data: {
        workbookId,
        name: nextName,
        order: nextOrder,
        columns: schema.columns,
        merges: schema.merges,
        rows: schema.rows,
      },
    });

    return reply.status(201).send({ id: sheet.id, name: sheet.name, order: sheet.order });
  });

  app.delete<{ Params: { id: string } }>("/api/sheets/:id", async (req, reply) => {
    const sheetId = Number(req.params.id);
    const sheet = await prisma.sheet.findUnique({
      where: { id: sheetId },
      include: { workbook: { include: { sheets: { orderBy: { order: "asc" } } } } },
    });

    if (!sheet) return reply.status(404).send({ error: "Sheet not found" });
    if (sheet.workbook.sheets.length <= 1) {
      return reply.status(400).send({ error: "Workbook must keep at least one sheet" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.sheet.delete({ where: { id: sheetId } });

      const remaining = await tx.sheet.findMany({
        where: { workbookId: sheet.workbookId },
        orderBy: { order: "asc" },
      });

      for (let index = 0; index < remaining.length; index++) {
        await tx.sheet.update({
          where: { id: remaining[index].id },
          data: { order: index },
        });
      }
    });

    return { success: true, workbookId: sheet.workbookId };
  });

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

      const ab = templateToExcel({ id: "export", name: wb.name, groups: [], sheets });
      const buf = Buffer.from(ab);
      reply.header("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      reply.header("Content-Disposition", `attachment; filename="${wb.name}.xlsx"`);
      return reply.send(buf);
    }
  );
}
