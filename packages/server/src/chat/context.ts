import * as repo from "./repository.js";
import { DEFAULT_PROMPT, withSheetContext } from "./prompt.js";

interface Ref {
  type: "sheet";
  id: number;
  name: string;
}

export function parseRefs(content: string): Ref[] {
  const refs: Ref[] = [];
  const regex = /\[ref:(\w+):(\d+)\]/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    refs.push({ type: match[1] as "sheet", id: Number(match[2]), name: "" });
  }
  return refs;
}

function formatSheetData(sheet: { name: string; rows: string; uploadedData: string | null }, maxRows = 10): string {
  const celldata = sheet.uploadedData ? JSON.parse(sheet.uploadedData) : JSON.parse(sheet.rows);
  return `Sheet "${sheet.name}" 数据 (${celldata.length} 行):\n${JSON.stringify(celldata.slice(0, maxRows))}`;
}

export async function buildSystemPrompt(userText: string): Promise<string> {
  const refs = parseRefs(userText);
  let context = "";

  if (refs.length > 0) {
    context = "当前可用的数据:";
    for (const ref of refs) {
      if (ref.type === "sheet") {
        const refSheet = await repo.findSheet(ref.id);
        if (refSheet) {
          context += `\n\n[${formatSheetData(refSheet)}]`;
        }
      }
    }
  }

  if (!context) {
    return DEFAULT_PROMPT;
  }

  return withSheetContext(context);
}