import * as repo from "./repository.js";
import { DEFAULT_PROMPT } from "./prompt.js";

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

export function buildSystemPrompt(): string {
  return DEFAULT_PROMPT;
}