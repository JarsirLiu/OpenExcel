import type { ContextTranscriptEntry } from "../transcript.js";
import { ContextCompactionError } from "./types.js";

export interface ContextTurn {
  startIndex: number;
  entries: ContextTranscriptEntry[];
}

export function groupTranscriptTurns(entries: readonly ContextTranscriptEntry[]): ContextTurn[] {
  const turns: ContextTurn[] = [];
  let current: ContextTurn | undefined;

  entries.forEach((entry, index) => {
    const message = asMessage(entry.message);
    if (message.role === "user") {
      if (current) turns.push(current);
      current = { startIndex: index, entries: [entry] };
      return;
    }

    if (!current) current = { startIndex: index, entries: [] };
    current.entries.push(entry);
  });

  if (current) turns.push(current);
  return turns;
}

function asMessage(value: unknown): { role?: unknown } {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ContextCompactionError("Transcript contains a non-message value", "boundary");
  }
  return value as { role?: unknown };
}
