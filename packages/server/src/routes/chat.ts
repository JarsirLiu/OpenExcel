import type { FastifyInstance } from "fastify";
import { prisma } from "../db.js";
import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

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

function stripRefs(content: string): string {
  return content.replace(/\[ref:\w+:\d+\]/g, "");
}

function getMessageText(msg: any): string {
  if (msg.content) return msg.content;
  if (msg.parts && Array.isArray(msg.parts)) {
    return msg.parts
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join("");
  }
  return "";
}

export async function chatRoutes(app: FastifyInstance) {
  app.get<{ Params: { sheetId: string } }>("/api/sheets/:sheetId/messages", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const messages = await prisma.message.findMany({
      where: { sheetId },
      orderBy: { createdAt: "asc" },
    });
    return messages.map((m) => ({
      id: String(m.id),
      role: m.role,
      content: m.content,
    }));
  });

  app.post<{
    Params: { sheetId: string };
    Body: { messages: any[] };
  }>("/api/sheets/:sheetId/chat", async (req, reply) => {
    const sheetId = Number(req.params.sheetId);
    const { messages: incomingMessages } = req.body;
    console.log("[chat] Received request for sheet", sheetId, "messages:", incomingMessages?.length);

    const sheet = await prisma.sheet.findUnique({
      where: { id: sheetId },
    });
    if (!sheet) {
      return reply.status(404).send({ error: "Sheet not found" });
    }

    const celldata = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : JSON.parse(sheet.rows);
    const lastUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");
    const userText = lastUserMsg ? getMessageText(lastUserMsg) : "";
    const refs = parseRefs(userText);

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

    const systemPrompt = `你是一个专业的 Excel 数据分析助手。你可以读取、分析、总结 Excel 表格中的数据。

${context}

请基于以上数据回答用户的问题。如果数据不足以回答，请说明需要哪些额外信息。`;

    await prisma.message.create({
      data: {
        sheetId,
        role: "user",
        content: userText,
      },
    });

    try {
      const config = loadModelConfig();
      console.log("[chat] Config loaded:", config.modelName, config.baseUrl);

      const customOpenAI = createOpenAI({
        baseURL: config.baseUrl,
        apiKey: config.apiKey,
      });

      const cleanedMessages = incomingMessages.map((m: any) => ({
        role: m.role as "user" | "assistant",
        content: stripRefs(getMessageText(m)),
      }));

      console.log("[chat] Calling streamText with", cleanedMessages.length, "messages");
      const result = streamText({
        model: customOpenAI.chat(config.modelName),
        system: systemPrompt,
        messages: cleanedMessages,
        onFinish: async ({ text }) => {
          console.log("[chat] Stream finished, saving", text.length, "chars");
          await prisma.message.create({
            data: {
              sheetId,
              role: "assistant",
              content: text,
            },
          });
        },
      });
      console.log("[chat] streamText started, writing response");

      reply.raw.writeHead(200, {
        "Content-Type": "text/plain",
        "Transfer-Encoding": "chunked",
      });

      for await (const chunk of result.textStream) {
        reply.raw.write(chunk);
      }
      reply.raw.end();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("AI 调用失败:", msg);
      if (!reply.raw.headersSent) {
        reply.status(500).send({ error: `AI 调用失败: ${msg}` });
      } else {
        reply.raw.end();
      }
    }
  });
}