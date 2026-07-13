import type { CellRange, DocumentMutation, DocumentOperation } from "@openexcel/core";
import * as service from "./service.js";

export async function applyToolOperations(
  workspaceId: number,
  sheetId: number,
  operations: DocumentOperation[],
  runId?: number,
) {
  const sheet = await service.getSheetInfo(workspaceId, sheetId);
  if (!sheet) throw new Error(`Sheet ${sheetId} 不存在`);

  const result = await service.applyOperations(
    workspaceId,
    sheetId,
    { operations, expectedRevision: sheet.revision },
    runId,
  );
  if ("error" in result) throw new Error(result.error);
  const mutation: DocumentMutation = {
    sheetId,
    revision: result.revision,
    changedRanges: result.changedRanges,
    objectIds: result.objectIds,
  };
  return { sheet, revision: result.revision, mutation, result };
}

export async function readToolRange(workspaceId: number, sheetId: number, range: CellRange) {
  const result = await service.readRange(workspaceId, sheetId, range);
  if ("error" in result) throw new Error(result.error);
  return result;
}
