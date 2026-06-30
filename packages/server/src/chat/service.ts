import { prisma } from "../db.js";
import { loadModelConfig } from "../config.js";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import * as repo from "./repository.js";

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

export async function getMessages(sheetId: number) {
  const messages = await repo.findMessagesBySheet(sheetId);
  return messages.map((m) => ({
    id: String(m.id),
    role: m.role,
    content: m.content,
  }));
}

export async function chat(sheetId: number, incomingMessages: any[]) {
  const sheet = await repo.findSheet(sheetId);
  if (!sheet) return { error: "Sheet not found" };

  const celldata = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : JSON.parse(sheet.rows);
  const lastUserMsg = [...incomingMessages].reverse().find((m) => m.role === "user");
  const userText = lastUserMsg ? getMessageText(lastUserMsg) : "";
  const refs = parseRefs(userText);

  let context = `当前 Sheet "${sheet.name}" 数据 (${celldata.length} 行):\n${JSON.stringify(celldata.slice(0, 10))}`;

  if (refs.length > 0) {
    context += "\n\n引用的数据:";
    for (const ref of refs) {
      if (ref.type === "sheet") {
        const refSheet = await repo.findSheet(ref.id);
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

  await repo.createMessage(sheetId, "user", userText);

  const config = loadModelConfig();
  const customOpenAI = createOpenAI({
    baseURL: config.baseUrl,
    apiKey: config.apiKey,
  });

  const cleanedMessages = incomingMessages.map((m: any) => ({
    role: m.role as "user" | "assistant",
    content: stripRefs(getMessageText(m)),
  }));

  const result = streamText({
    model: customOpenAI.chat(config.modelName),
    system: systemPrompt,
    messages: cleanedMessages,
    onFinish: async ({ text }) => {
      await repo.createMessage(sheetId, "assistant", text);
    },
  });

  return { result };
}