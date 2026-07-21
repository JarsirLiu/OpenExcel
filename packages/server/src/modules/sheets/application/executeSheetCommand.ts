import {
  applySheetMutation,
  cloneSheetSnapshot,
  type SheetCommand,
  type SheetCommandResult,
  type SheetSnapshot,
  sheetCommandSchema,
} from "@openexcel/core";
import { sheetRecordToCelldata } from "../../../shared/utils/sheetData.js";
import {
  SheetMutationIdConflictError,
  SheetNotFoundError,
  SheetRevisionConflictError,
} from "../domain/errors.js";
import * as receiptRepo from "../infrastructure/sheetMutationReceiptRepository.js";
import * as sheetRepo from "../infrastructure/sheetRepository.js";
import { sheetCommandFingerprint } from "./sheetCommandFingerprint.js";

type StoredCommandResult = Omit<SheetCommandResult, "snapshot">;

function parseConfig(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function snapshotFromSheet(
  sheet: Awaited<ReturnType<typeof sheetRepo.findSheetForWorkspace>>,
): SheetSnapshot {
  if (!sheet) throw new Error("Sheet not found");
  return {
    celldata: sheetRecordToCelldata(sheet),
    config: parseConfig(sheet.config),
  };
}

function storedResult(result: StoredCommandResult, snapshot: SheetSnapshot): SheetCommandResult {
  return { ...result, snapshot: cloneSheetSnapshot(snapshot) };
}

function parseStoredResult(value: string): StoredCommandResult {
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || !("revision" in parsed)) {
    throw new Error("Invalid sheet mutation receipt");
  }
  return parsed as StoredCommandResult;
}

function commandResult(
  command: SheetCommand,
  revision: number,
  changeSummary: SheetCommandResult["changeSummary"],
): StoredCommandResult {
  return {
    mutationId: command.mutationId,
    sheetId: command.sheetId,
    baseRevision: command.baseRevision,
    revision,
    mutation: command.kind === "mutation" ? command.mutation : null,
    changeSummary,
  };
}

export async function executeSheetCommand(
  workspaceId: number,
  input: SheetCommand,
): Promise<SheetCommandResult> {
  const command = sheetCommandSchema.parse(input) as SheetCommand;
  const commandHash = sheetCommandFingerprint(command);
  const sheet = await sheetRepo.findSheetForWorkspace(command.sheetId, workspaceId);
  if (!sheet) throw new SheetNotFoundError(command.sheetId);

  const receipt = await receiptRepo.findSheetMutationReceipt(command.mutationId);
  if (receipt) {
    const result = parseStoredResult(receipt.result);
    if (result.sheetId !== command.sheetId || receipt.commandHash !== commandHash) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    const currentSheet = await sheetRepo.findSheetForWorkspace(command.sheetId, workspaceId);
    if (!currentSheet) throw new SheetNotFoundError(command.sheetId);
    return storedResult(result, snapshotFromSheet(currentSheet));
  }

  if (sheet.revision !== command.baseRevision) {
    throw new SheetRevisionConflictError(command.sheetId);
  }

  const current = snapshotFromSheet(sheet);
  const applied =
    command.kind === "mutation"
      ? applySheetMutation(current, command.mutation)
      : {
          snapshot: cloneSheetSnapshot(command.snapshot),
          mutation: null,
          changeSummary: {
            changedCellCount: command.snapshot.celldata.length,
            rangeOperationCount: 0,
          },
        };
  const revision = command.baseRevision + 1;
  const result = commandResult(command, revision, applied.changeSummary);

  const commit = await receiptRepo.commitSheetCommand({
    sheetId: command.sheetId,
    workspaceId,
    baseRevision: command.baseRevision,
    uploadedData: JSON.stringify(applied.snapshot.celldata),
    config: applied.snapshot.config ? JSON.stringify(applied.snapshot.config) : null,
    mutationId: command.mutationId,
    commandHash,
    result: JSON.stringify(result),
  });
  if (commit.kind === "missing") throw new SheetNotFoundError(command.sheetId);
  if (commit.kind === "replayed") {
    if (commit.commandHash !== commandHash) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    const currentSheet = await sheetRepo.findSheetForWorkspace(command.sheetId, workspaceId);
    if (!currentSheet) throw new SheetNotFoundError(command.sheetId);
    return storedResult(parseStoredResult(commit.result), snapshotFromSheet(currentSheet));
  }
  if (commit.kind === "conflict") {
    const replay = await receiptRepo.findSheetMutationReceipt(command.mutationId);
    if (replay) {
      if (replay.commandHash !== commandHash) {
        throw new SheetMutationIdConflictError(command.mutationId);
      }
      const currentSheet = await sheetRepo.findSheetForWorkspace(command.sheetId, workspaceId);
      if (!currentSheet) throw new SheetNotFoundError(command.sheetId);
      return storedResult(parseStoredResult(replay.result), snapshotFromSheet(currentSheet));
    }
    throw new SheetRevisionConflictError(command.sheetId);
  }
  return storedResult(result, applied.snapshot);
}
