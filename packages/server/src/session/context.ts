import * as repo from "./repository.js";

const MAX_TURNS = 20;

export function historyFromRuns(runs: Awaited<ReturnType<typeof repo.findRunsBySession>>) {
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

export function buildWorkplaceContext(): Promise<string> {
  return repo.findWorkbooksWithSheets().then((wbs) => {
    if (wbs.length === 0) return "当前没有可用的工作簿。";
    return wbs
      .map(
        (wb) =>
          `工作簿: ${wb.name} (id: ${wb.id})\n${wb.sheets
            .map((s) => `  - Sheet: ${s.name} (id: ${s.id})`)
            .join("\n")}`,
      )
      .join("\n");
  });
}
