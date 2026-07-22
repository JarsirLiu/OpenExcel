import {
  applySheetMutation,
  cloneSheetSnapshot,
  type SheetCommand,
  type SheetCommandResult,
  type SheetSnapshot,
  sheetCommandSchema,
} from "@openexcel/core";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import {
  serializeSheetSnapshot,
  sheetRecordToSnapshot,
} from "../../../shared/utils/sheetSnapshot.js";
import {
  SheetMutationIdConflictError,
  SheetNotFoundError,
  SheetRevisionConflictError,
} from "../domain/errors.js";
import { commitSheetCommandInTransaction } from "../infrastructure/sheetMutationReceiptRepository.js";
import { sheetCommandFingerprint } from "./sheetCommandFingerprint.js";

type StoredCommandResult = Omit<SheetCommandResult, "snapshot">;

type SheetTransaction = Prisma.TransactionClient;

function snapshotFromSheet(
  sheet: Awaited<ReturnType<SheetTransaction["sheet"]["findFirst"]>>,
): SheetSnapshot {
  if (!sheet) throw new Error("Sheet not found");
  return sheetRecordToSnapshot(sheet);
}

function storedResult(
  result: StoredCommandResult,
  snapshot: SheetSnapshot,
  revision = result.revision,
): SheetCommandResult {
  return { ...result, revision, snapshot: cloneSheetSnapshot(snapshot) };
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

function applyCommand(current: SheetSnapshot, command: SheetCommand) {
  return command.kind === "mutation"
    ? applySheetMutation(current, command.mutation)
    : {
        snapshot: cloneSheetSnapshot(command.snapshot),
        mutation: null,
        changeSummary: {
          changedCellCount: command.snapshot.celldata.length,
          rangeOperationCount: 0,
        },
      };
}

export async function executeSheetCommandInTransaction(
  tx: SheetTransaction,
  workspaceId: number,
  input: SheetCommand,
): Promise<SheetCommandResult> {
  const command = sheetCommandSchema.parse(input) as SheetCommand;
  const commandHash = sheetCommandFingerprint(command);
  const sheet = await tx.sheet.findFirst({
    where: { id: command.sheetId, workbook: { workspaceId } },
    include: { workbook: true },
  });
  if (!sheet) throw new SheetNotFoundError(command.sheetId);

  const receipt = await tx.sheetMutationReceipt.findUnique({
    where: { mutationId: command.mutationId },
  });
  if (receipt) {
    const result = parseStoredResult(receipt.result);
    if (result.sheetId !== command.sheetId || receipt.commandHash !== commandHash) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    return storedResult(result, snapshotFromSheet(sheet), sheet.revision);
  }

  if (sheet.revision !== command.baseRevision) {
    throw new SheetRevisionConflictError(command.sheetId);
  }

  const applied = applyCommand(snapshotFromSheet(sheet), command);
  const revision = command.baseRevision + 1;
  const result = commandResult(command, revision, applied.changeSummary);
  const persistedSnapshot = serializeSheetSnapshot(applied.snapshot);
  const commit = await commitSheetCommandInTransaction(tx, {
    sheetId: command.sheetId,
    workspaceId,
    baseRevision: command.baseRevision,
    merges: persistedSnapshot.merges,
    uploadedData: persistedSnapshot.uploadedData,
    config: persistedSnapshot.config,
    mutationId: command.mutationId,
    commandHash,
    result: JSON.stringify(result),
  });

  if (commit.kind === "missing") throw new SheetNotFoundError(command.sheetId);
  if (commit.kind === "replayed") {
    if (commit.commandHash !== commandHash) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    const currentSheet = await tx.sheet.findFirst({
      where: { id: command.sheetId, workbook: { workspaceId } },
      include: { workbook: true },
    });
    if (!currentSheet) throw new SheetNotFoundError(command.sheetId);
    return storedResult(
      parseStoredResult(commit.result),
      snapshotFromSheet(currentSheet),
      currentSheet.revision,
    );
  }
  if (commit.kind === "conflict") {
    throw new SheetRevisionConflictError(command.sheetId);
  }

  return storedResult(result, applied.snapshot);
}

export async function executeSheetCommand(
  workspaceId: number,
  input: SheetCommand,
): Promise<SheetCommandResult> {
  return prisma.$transaction((tx) => executeSheetCommandInTransaction(tx, workspaceId, input));
}
