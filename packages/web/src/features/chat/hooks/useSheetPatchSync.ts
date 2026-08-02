import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { sheetChangePatchOutputSchema } from "@openexcel/core";
import { useEffect, useRef } from "react";
import type { SheetPatchUpdate } from "@/features/sync/types";
import type { ChatEvent } from "../transport/chatEventStream";

export type { SheetPatchUpdate } from "@/features/sync/types";

export type SheetPatchMessageLike = {
  role?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type CompletedToolPart = {
  toolCallId: string;
  state: "output-available";
  output: unknown;
  type: string;
  input: unknown;
};

function isCompletedToolPart(part: unknown): part is CompletedToolPart {
  if (!isRecord(part)) return false;
  return (
    typeof part.toolCallId === "string" &&
    typeof part.type === "string" &&
    part.type.startsWith("tool-") &&
    part.state === "output-available" &&
    "input" in part &&
    "output" in part
  );
}

const SHEET_MUTATION_TOOLS = new Set(["writeCells", "clearCells", "mergeCells", "unmergeCells"]);
const WORKBOOK_MUTATION_TOOLS = new Set(["createWorkbook", "createSheet"]);
const CHART_MUTATION_TOOLS = new Set(["createChart", "updateChart", "deleteChart"]);

export type CommittedMutationToolEvent =
  | { kind: "sheet"; update: SheetPatchUpdate }
  | { kind: "workbook"; toolCallId: string }
  | { kind: "chart"; toolCallId: string };

function parseSheetPatchUpdate(toolCallId: string, output: unknown): SheetPatchUpdate | null {
  const parsed = sheetChangePatchOutputSchema.safeParse(output);
  if (!parsed.success) return null;

  const version =
    parsed.data.baseRevision != null && parsed.data.revision != null
      ? {
          baseRevision: parsed.data.baseRevision,
          revision: parsed.data.revision,
        }
      : undefined;

  return {
    toolCallId,
    sheetId: parsed.data.sheetInfo.sheetId,
    sheetNo: parsed.data.sheetInfo.sheetNo,
    delta: parsed.data.delta ?? null,
    ...(version ? { version } : {}),
  };
}

/** Parses a server-confirmed sheet mutation directly from the live event stream. */
export function parseCommittedSheetToolEvent(event: ChatEvent): SheetPatchUpdate | null {
  if (event.type !== "tool.finished") return null;
  if (typeof event.payload !== "object" || event.payload === null) return null;

  const payload = event.payload as Record<string, unknown>;
  if (
    typeof payload.toolCallId !== "string" ||
    typeof payload.toolName !== "string" ||
    payload.error != null ||
    !SHEET_MUTATION_TOOLS.has(payload.toolName)
  ) {
    return null;
  }

  return parseSheetPatchUpdate(payload.toolCallId, payload.output);
}

export function parseCommittedMutationToolEvent(
  event: ChatEvent,
): CommittedMutationToolEvent | null {
  if (event.type !== "tool.finished") return null;
  if (typeof event.payload !== "object" || event.payload === null) return null;

  const payload = event.payload as Record<string, unknown>;
  if (
    typeof payload.toolCallId !== "string" ||
    typeof payload.toolName !== "string" ||
    payload.error != null
  ) {
    return null;
  }

  const sheetUpdate = parseCommittedSheetToolEvent(event);
  if (sheetUpdate) return { kind: "sheet", update: sheetUpdate };
  if (WORKBOOK_MUTATION_TOOLS.has(payload.toolName)) {
    return { kind: "workbook", toolCallId: payload.toolCallId };
  }
  if (CHART_MUTATION_TOOLS.has(payload.toolName)) {
    return { kind: "chart", toolCallId: payload.toolCallId };
  }
  return null;
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

      const update = parseSheetPatchUpdate(part.toolCallId, part.output);
      if (update) updates.push(update);
    }
  }

  return updates;
}

export function collectSheetMutationToolCallIds(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  seenToolCallIds: ReadonlySet<string>,
): string[] {
  return collectSheetPatchUpdates(messages, seenToolCallIds).map((update) => update.toolCallId);
}

export function useSheetPatchSync(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  onSheetChanged?: (
    sheetId: number,
    delta: SheetChangeDelta | null,
    version?: SheetChangeVersion,
  ) => void,
  historyReady = true,
  historicalToolCallIds?: ReadonlySet<string>,
  liveToolCallIds?: ReadonlySet<string>,
) {
  const appliedToolCallIdsRef = useRef<Set<string>>(new Set());
  const historyPrimedRef = useRef(false);

  useEffect(() => {
    if (!historyReady) return;

    if (!historyPrimedRef.current) {
      const initialPatchUpdates = collectSheetPatchUpdates(messages, new Set());
      for (const update of initialPatchUpdates) {
        if (
          (historicalToolCallIds?.has(update.toolCallId) ?? true) ||
          liveToolCallIds?.has(update.toolCallId)
        ) {
          appliedToolCallIdsRef.current.add(update.toolCallId);
          continue;
        }
        if (update.version) {
          onSheetChanged?.(update.sheetId, update.delta, update.version);
        } else {
          onSheetChanged?.(update.sheetId, update.delta);
        }
      }

      historyPrimedRef.current = true;
      return;
    }

    const seenToolCallIds = new Set(appliedToolCallIdsRef.current);
    for (const toolCallId of historicalToolCallIds ?? []) {
      seenToolCallIds.add(toolCallId);
    }
    for (const toolCallId of liveToolCallIds ?? []) {
      seenToolCallIds.add(toolCallId);
    }

    const patchUpdates = onSheetChanged ? collectSheetPatchUpdates(messages, seenToolCallIds) : [];
    for (const update of patchUpdates) {
      appliedToolCallIdsRef.current.add(update.toolCallId);
      if (update.version) {
        onSheetChanged?.(update.sheetId, update.delta, update.version);
      } else {
        onSheetChanged?.(update.sheetId, update.delta);
      }
    }
  }, [historyReady, historicalToolCallIds, liveToolCallIds, messages, onSheetChanged]);
}
