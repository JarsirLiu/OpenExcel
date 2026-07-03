import { useEffect, useRef } from "react";
import { sheetChangePatchOutputSchema, type SheetChangeDelta } from "@openexcel/core";

export type SheetPatchMessageLike = {
  role?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

export type SheetPatchUpdate = {
  toolCallId: string;
  sheetId: number;
  delta: SheetChangeDelta | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type CompletedToolPart = {
  toolCallId: string;
  state: "output-available";
  output: unknown;
};

function isCompletedToolPart(part: unknown): part is CompletedToolPart {
  if (!isRecord(part)) return false;
  return typeof part.toolCallId === "string"
    && part.state === "output-available"
    && "output" in part;
}

export function collectSheetPatchUpdates(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  seenToolCallIds: ReadonlySet<string>,
): SheetPatchUpdate[] {
  const updates: SheetPatchUpdate[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;

    for (const part of message.parts) {
      if (!isCompletedToolPart(part)) continue;
      if (seenToolCallIds.has(part.toolCallId)) continue;

      const parsed = sheetChangePatchOutputSchema.safeParse(part.output);
      if (!parsed.success) continue;

      updates.push({
        toolCallId: part.toolCallId,
        sheetId: parsed.data.sheetInfo.sheetId,
        delta: parsed.data.delta ?? null,
      });
    }
  }

  return updates;
}

export function useSheetPatchSync(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void,
) {
  const appliedToolCallIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!onSheetChanged) return;

    const updates = collectSheetPatchUpdates(messages, appliedToolCallIdsRef.current);
    for (const update of updates) {
      appliedToolCallIdsRef.current.add(update.toolCallId);
      onSheetChanged(update.sheetId, update.delta);
    }
  }, [messages, onSheetChanged]);
}
