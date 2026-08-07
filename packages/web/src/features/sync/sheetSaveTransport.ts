import type { SheetChangeDelta, SheetCommand } from "@openexcel/core";
import { executeSheetCommand } from "@/api/workbooks";
import {
  latestSheetConfigChange,
  mergeSheetCellChange,
  type SheetCellChange,
  type SheetChangeSet,
} from "./sheetChangeSet";
import type { SheetSaveRequest } from "./sheetSaveTypes";

type PatchMutation = Extract<SheetChangeDelta, { type: "patch" }>;

function createMutationId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `web-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

function flattenCellChanges(changeSet: SheetChangeSet): SheetCellChange[] {
  const cells = new Map<string, SheetCellChange>();
  for (const changes of [
    changeSet.valueChanges,
    changeSet.formulaCacheChanges,
    changeSet.formatChanges,
  ]) {
    for (const change of changes) mergeSheetCellChange(cells, change);
  }
  return [...cells.values()];
}

export function serializeSheetChangeSet(changeSet: SheetChangeSet): PatchMutation | null {
  const cells = flattenCellChanges(changeSet);
  const config = latestSheetConfigChange(changeSet.configChanges);
  if (cells.length === 0 && !config) return null;
  return {
    type: "patch",
    cells,
    ...(config ? { config: config.config as Record<string, unknown> | null } : {}),
  };
}

export function serializeSheetSaveRequest(
  sheetId: number,
  request: SheetSaveRequest,
): SheetCommand {
  if (request.kind === "changeSet") {
    const mutation = serializeSheetChangeSet(request.changeSet);
    if (!mutation) throw new Error("Cannot serialize an empty Sheet change set");
    return {
      kind: "mutation",
      mutationId: createMutationId(),
      sheetId,
      baseRevision: request.baseRevision,
      mutation,
    };
  }
  return {
    kind: "replaceChunks",
    mutationId: createMutationId(),
    sheetId,
    baseRevision: request.baseRevision,
    config: request.config as Record<string, unknown> | null,
    chunks: request.chunks,
  };
}

export async function saveSheet(
  workspaceId: number,
  sheetId: number,
  request: SheetSaveRequest,
): Promise<{ revision: number }> {
  return executeSheetCommand(workspaceId, serializeSheetSaveRequest(sheetId, request));
}
