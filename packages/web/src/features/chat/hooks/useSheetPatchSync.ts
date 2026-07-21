import { type SheetChangeDelta, sheetChangePatchOutputSchema } from "@openexcel/core";
import { useEffect, useRef } from "react";

export type SheetPatchMessageLike = {
  role?: unknown;
  parts?: ReadonlyArray<unknown> | null;
};

export type SheetPatchUpdate = {
  toolCallId: string;
  sheetId: number;
  sheetNo?: number;
  delta: SheetChangeDelta | null;
};

export type WorkbookCreatedUpdate = {
  toolCallId: string;
  kind: "workbook-created";
  workbookId: number;
  workbookName: string;
  order: number;
  sourceSheetId: number | null;
  initialSheet: {
    id: number;
    sheetNo: number;
    name: string;
    order: number;
  };
};

export type SheetCreatedUpdate = {
  toolCallId: string;
  kind: "sheet-created";
  workbookId: number;
  sheetId: number;
  sheetNo?: number;
  sheetName: string;
  order: number;
  sourceSheetId: number | null;
};

export type SheetDeletedUpdate = {
  toolCallId: string;
  kind: "sheet-deleted";
  workbookId: number;
  sheetId: number;
  sheetNo?: number;
  order: number;
};

export type WorkbookStructureUpdate =
  | WorkbookCreatedUpdate
  | SheetCreatedUpdate
  | SheetDeletedUpdate;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

type CompletedToolPart = {
  toolCallId: string;
  state: "output-available";
  output: unknown;
  input?: unknown;
  args?: unknown;
  toolName?: unknown;
  type?: unknown;
};

function isCompletedToolPart(part: unknown): part is CompletedToolPart {
  if (!isRecord(part)) return false;
  return (
    typeof part.toolCallId === "string" && part.state === "output-available" && "output" in part
  );
}

function getToolName(part: CompletedToolPart): string {
  // ai-sdk v7 static tool: type is "tool-${name}" (e.g. "tool-createSheet")
  if (typeof part.type === "string" && part.type.startsWith("tool-")) {
    return part.type.slice("tool-".length);
  }
  // ai-sdk v7 dynamic tool or legacy v4 format
  if (typeof part.toolName === "string") {
    return part.toolName;
  }
  return "";
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
        sheetNo: parsed.data.sheetInfo.sheetNo,
        delta: parsed.data.delta ?? null,
      });
    }
  }

  return updates;
}

function getToolInput(part: CompletedToolPart): Record<string, unknown> | null {
  if (isRecord(part.input)) return part.input;
  if (isRecord(part.args)) return part.args;
  return null;
}

function isWorkbookCreatedOutput(output: unknown): output is {
  id: number;
  name: string;
  order: number;
  sheets: number;
  initialSheet: { id: number; sheetNo: number; name: string; order: number };
} {
  if (!isRecord(output)) return false;
  return (
    typeof output.id === "number" &&
    typeof output.name === "string" &&
    typeof output.order === "number" &&
    typeof output.sheets === "number" &&
    isRecord(output.initialSheet) &&
    typeof output.initialSheet.id === "number" &&
    typeof output.initialSheet.sheetNo === "number" &&
    typeof output.initialSheet.name === "string" &&
    typeof output.initialSheet.order === "number"
  );
}

function isSheetCreatedOutput(output: unknown): output is {
  workbookId: number;
  id: number;
  sheetNo: number;
  name: string;
  order: number;
} {
  if (!isRecord(output)) return false;
  return (
    typeof output.workbookId === "number" &&
    typeof output.id === "number" &&
    typeof output.sheetNo === "number" &&
    typeof output.name === "string" &&
    typeof output.order === "number"
  );
}

export function collectWorkbookStructureUpdates(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  seenToolCallIds: ReadonlySet<string>,
): WorkbookStructureUpdate[] {
  const updates: WorkbookStructureUpdate[] = [];

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;

    for (const part of message.parts) {
      if (!isCompletedToolPart(part)) continue;
      if (seenToolCallIds.has(part.toolCallId)) continue;

      const toolName = getToolName(part);
      const input = getToolInput(part);

      if (toolName === "createWorkbook" && isWorkbookCreatedOutput(part.output)) {
        updates.push({
          toolCallId: part.toolCallId,
          kind: "workbook-created",
          workbookId: part.output.id,
          workbookName: part.output.name,
          order: part.output.order,
          sourceSheetId: typeof input?.sourceSheetId === "number" ? input.sourceSheetId : null,
          initialSheet: part.output.initialSheet,
        });
        continue;
      }

      if (toolName === "createSheet" && isSheetCreatedOutput(part.output)) {
        updates.push({
          toolCallId: part.toolCallId,
          kind: "sheet-created",
          workbookId: part.output.workbookId,
          sheetId: part.output.id,
          sheetNo: part.output.sheetNo,
          sheetName: part.output.name,
          order: part.output.order,
          sourceSheetId: typeof input?.sourceSheetId === "number" ? input.sourceSheetId : null,
        });
      }
    }
  }

  return updates;
}

export function collectWorkbookMutationToolCallIds(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  seenToolCallIds: ReadonlySet<string>,
): string[] {
  return collectWorkbookRefreshToolCallIds(messages, seenToolCallIds, {
    sheetDeltasHandled: false,
  });
}

export function collectWorkbookRefreshToolCallIds(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  seenToolCallIds: ReadonlySet<string>,
  options: { sheetDeltasHandled?: boolean } = {},
): string[] {
  const toolCallIds = new Set<string>();
  const patchUpdates = collectSheetPatchUpdates(messages, seenToolCallIds);
  const seenAfterPatchUpdates = new Set(seenToolCallIds);
  if (!options.sheetDeltasHandled) {
    for (const update of patchUpdates) {
      toolCallIds.add(update.toolCallId);
    }
  }
  for (const update of patchUpdates) {
    seenAfterPatchUpdates.add(update.toolCallId);
  }

  const structureUpdates = collectWorkbookStructureUpdates(messages, seenAfterPatchUpdates);
  for (const update of structureUpdates) {
    toolCallIds.add(update.toolCallId);
  }

  const seenAfterStructureUpdates = new Set(seenAfterPatchUpdates);
  for (const update of structureUpdates) {
    seenAfterStructureUpdates.add(update.toolCallId);
  }

  for (const message of messages) {
    if (message.role !== "assistant" || !Array.isArray(message.parts)) continue;
    for (const part of message.parts) {
      if (!isCompletedToolPart(part) || seenAfterStructureUpdates.has(part.toolCallId)) continue;
      if (["createChart", "updateChart", "deleteChart"].includes(getToolName(part))) {
        toolCallIds.add(part.toolCallId);
      }
    }
  }

  return Array.from(toolCallIds);
}

export function useSheetPatchSync(
  messages: ReadonlyArray<SheetPatchMessageLike>,
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void,
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void,
  historyReady = true,
  historicalToolCallIds?: ReadonlySet<string>,
) {
  const appliedToolCallIdsRef = useRef<Set<string>>(new Set());
  const historyPrimedRef = useRef(false);

  useEffect(() => {
    if (!historyReady) return;

    if (!historyPrimedRef.current) {
      const initialPatchUpdates = collectSheetPatchUpdates(messages, new Set());
      for (const update of initialPatchUpdates) {
        if (historicalToolCallIds?.has(update.toolCallId) ?? true) {
          appliedToolCallIdsRef.current.add(update.toolCallId);
          continue;
        }
        onSheetChanged?.(update.sheetId, update.delta);
      }

      const initialStructureUpdates = collectWorkbookStructureUpdates(messages, new Set());
      for (const update of initialStructureUpdates) {
        if (historicalToolCallIds?.has(update.toolCallId) ?? true) {
          appliedToolCallIdsRef.current.add(update.toolCallId);
          continue;
        }
        onWorkbookStructureChanged?.(update);
      }

      historyPrimedRef.current = true;
      return;
    }

    const seenToolCallIds = new Set(appliedToolCallIdsRef.current);
    for (const toolCallId of historicalToolCallIds ?? []) {
      seenToolCallIds.add(toolCallId);
    }

    const patchUpdates = onSheetChanged ? collectSheetPatchUpdates(messages, seenToolCallIds) : [];
    for (const update of patchUpdates) {
      appliedToolCallIdsRef.current.add(update.toolCallId);
      onSheetChanged?.(update.sheetId, update.delta);
    }

    const seenAfterPatchUpdates = new Set(seenToolCallIds);
    for (const update of patchUpdates) {
      seenAfterPatchUpdates.add(update.toolCallId);
    }

    const structureUpdates = onWorkbookStructureChanged
      ? collectWorkbookStructureUpdates(messages, seenAfterPatchUpdates)
      : [];
    for (const update of structureUpdates) {
      appliedToolCallIdsRef.current.add(update.toolCallId);
      onWorkbookStructureChanged?.(update);
    }
  }, [historyReady, historicalToolCallIds, messages, onSheetChanged, onWorkbookStructureChanged]);
}
