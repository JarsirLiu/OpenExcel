import { buildWorkspaceContext as buildAgentWorkspaceContext } from "@openexcel/agent";
import type { findRunsBySession } from "../runs/repository.js";
import * as workbookRepo from "../../workbooks/repository.js";

const MAX_TURNS = 20;

export function historyFromRuns(runs: Awaited<ReturnType<typeof findRunsBySession>>) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return trim(transcript);
}

function trim(messages: { role: string; content: string }[]): { role: "user" | "assistant"; content: string }[] {
  if (messages.length <= MAX_TURNS * 2) {
    return messages.slice() as any;
  }
  return messages.slice(-MAX_TURNS * 2) as any;
}

export async function buildWorkplaceContext(): Promise<string> {
  const workbooks = await workbookRepo.findWorkbooksWithSheets();
  return buildAgentWorkspaceContext(
    workbooks.map((workbook: (typeof workbooks)[number]) => ({
      id: workbook.id,
      name: workbook.name,
      sheets: workbook.sheets.map((sheet: (typeof workbook.sheets)[number]) => ({
        id: sheet.id,
        name: sheet.name,
      })),
    })),
  );
}
