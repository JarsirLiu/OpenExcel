import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";

interface Ref {
  type: "sheet";
  id: number;
  name: string;
}

function parseRefs(content: string): Ref[] {
  const refs: Ref[] = [];
  const regex = /\[ref:(\w+):(\d+)\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    refs.push({ type: match[1] as "sheet", id: Number(match[2]), name: "" });
  }
  return refs;
}

export async function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { sheetId: string } }>("/api/sheets/:sheetId/messages", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const messages = await prisma.message.findMany({
      where: { sheetId },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      changes: m.changes ? JSON.parse(m.changes) : null,
      createdAt: m.createdAt,
    }));
  });

  app.post<{
    Params: { sheetId: string };
    Body: { role: string; content: string; changes?: any[][] };
  }>("/api/sheets/:sheetId/messages", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const { role, content, changes } = req.body;

    const message = await prisma.message.create({
      data: {
        sheetId,
        role,
        content,
        changes: changes ? JSON.stringify(changes) : null,
      },
    });

    if (changes && Array.isArray(changes)) {
      await prisma.sheet.update({
        where: { id: sheetId },
        data: { uploadedData: JSON.stringify(changes) },
      });
    }

    return {
      id: message.id,
      role: message.role,
      content: message.content,
      changes: changes || null,
      createdAt: message.createdAt,
    };
  });

  app.post<{
    Params: { sheetId: string };
    Body: { prompt: string };
  }>("/api/sheets/:sheetId/chat", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const { prompt } = req.body;

    const sheet = await prisma.sheet.findUnique({
      where: { id: sheetId },
    });
    if (!sheet) {
      return reply.status(404).send({ error: "Sheet not found" });
    }

    const messages = await prisma.message.findMany({
      where: { sheetId },
      orderBy: { createdAt: "asc" },
      take: 20,
    });

    const userMessage = await prisma.message.create({
      data: {
        sheetId,
        role: "user",
        content: prompt,
      },
    });

    const celldata = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : JSON.parse(sheet.rows);

    const refs = parseRefs(prompt);
    let context = `当前 Sheet "${sheet.name}" 数据 (${celldata.length} 行):\n${JSON.stringify(celldata.slice(0, 10))}`;

    if (refs.length > 0) {
      context += "\n\n引用的数据:";
      for (const ref of refs) {
        if (ref.type === "sheet") {
          const refSheet = await prisma.sheet.findUnique({ where: { id: ref.id } });
          if (refSheet) {
            const refData = refSheet.uploadedData ? JSON.parse(refSheet.uploadedData) : JSON.parse(refSheet.rows);
            context += `\n\n[Sheet: ${refSheet.name}] (${refData.length} 行):\n${JSON.stringify(refData.slice(0, 10))}`;
          }
        }
      }
    }

    const mockResponse = `[AI] 收到你的请求："${prompt}"\n\n${context}\n\n（此处应调用真实 AI API，基于以上数据回答）`;

    const aiMessage = await prisma.message.create({
      data: {
        sheetId,
        role: "assistant",
        content: mockResponse,
      },
    });

    return {
      id: aiMessage.id,
      role: aiMessage.role,
      content: aiMessage.content,
      changes: null,
      createdAt: aiMessage.createdAt,
    };
  });
}
