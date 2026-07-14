import { buildWorkspaceContext as buildAgentWorkspaceContext } from "@openexcel/agent";
import * as workbookRepo from "../../workbooks/infrastructure/workbookRepository.js";
import type { findRunsBySession } from "../runs/repository.js";

export function historyFromRuns(runs: Awaited<ReturnType<typeof findRunsBySession>>) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  for (const run of runs) {
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return transcript;
}

export async function buildWorkspaceContext(workspaceId: number): Promise<string> {
  const workbooks = await workbookRepo.findWorkbooksWithSheets(workspaceId);
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
