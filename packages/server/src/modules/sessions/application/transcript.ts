import type { findRunsBySession } from "../runs/repository.js";

export function historyFromRuns(runs: Awaited<ReturnType<typeof findRunsBySession>>) {
  const transcript: { role: "user" | "assistant"; content: string }[] = [];
  const chronologicalRuns = [...runs].sort((left, right) => {
    const leftStartedAt = left.startedAt?.getTime?.() ?? 0;
    const rightStartedAt = right.startedAt?.getTime?.() ?? 0;
    return leftStartedAt - rightStartedAt || left.id - right.id;
  });

  for (const run of chronologicalRuns) {
    if (run.status === "reverted") continue;
    if (run.inputText) transcript.push({ role: "user", content: run.inputText });
    if (run.outputText) transcript.push({ role: "assistant", content: run.outputText });
  }
  return transcript;
}
