export type TranscriptCursor = number;

export interface ContextTranscriptEntry<Message = unknown> {
  cursor: TranscriptCursor;
  message: Message;
}

export function validateTranscriptEntries(entries: readonly ContextTranscriptEntry[]): void {
  let previousCursor = -1;
  for (const entry of entries) {
    if (!Number.isInteger(entry.cursor) || entry.cursor < 0) {
      throw new RangeError("Transcript cursors must be non-negative integers");
    }
    if (entry.cursor <= previousCursor) {
      throw new RangeError("Transcript cursors must be strictly increasing");
    }
    previousCursor = entry.cursor;
  }
}

export function messagesFromTranscript(
  entries: readonly ContextTranscriptEntry[],
): readonly unknown[] {
  return entries.map((entry) => entry.message);
}

export function appendTranscriptEntry<Message>(
  entries: readonly ContextTranscriptEntry<Message>[],
  message: Message,
): ContextTranscriptEntry<Message>[] {
  const cursor = entries.at(-1)?.cursor;
  return [...entries, { cursor: cursor === undefined ? 0 : cursor + 1, message }];
}
