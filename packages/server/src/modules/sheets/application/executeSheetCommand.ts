import {
  applySheetMutation,
  cloneSheetSnapshot,
  type SheetCommand,
  type SheetCommandReceipt,
  type SheetCommandResult,
  type SheetSnapshot,
  sheetCommandReceiptSchema,
  sheetCommandSchema,
  summarizeSheetSnapshotChange,
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

type StoredCommandResult = SheetCommandReceipt;

type SheetTransaction = Prisma.TransactionClient;

export type SheetCommandExecution = {
  result: SheetCommandResult;
  outcome: "committed" | "replayed";
};

function snapshotFromSheet(
  sheet: Awaited<ReturnType<SheetTransaction["sheet"]["findFirst"]>>,
): SheetSnapshot {
  if (!sheet) throw new Error("Sheet not found");
  return sheetRecordToSnapshot(sheet);
}

function resultFromReceipt(receipt: StoredCommandResult): SheetCommandExecution {
  return {
    result: { ...receipt, snapshot: null },
    outcome: "replayed",
  };
}

function parseStoredResult(value: string): StoredCommandResult {
  return sheetCommandReceiptSchema.parse(JSON.parse(value));
}

function commandResult(
  command: SheetCommand,
  revision: number,
  snapshot: SheetSnapshot,
  changeSummary: SheetCommandResult["changeSummary"],
): SheetCommandResult {
  return {
    mutationId: command.mutationId,
    sheetId: command.sheetId,
    baseRevision: command.baseRevision,
    revision,
    mutation: command.kind === "mutation" ? command.mutation : null,
    changeSummary,
    snapshot,
  };
}

function receiptFromResult(result: SheetCommandResult): StoredCommandResult {
  const { snapshot: _snapshot, ...receipt } = result;
  return receipt;
}

function applyCommand(current: SheetSnapshot, command: SheetCommand) {
  return command.kind === "mutation"
    ? applySheetMutation(current, command.mutation)
    : {
        snapshot: cloneSheetSnapshot(command.snapshot),
        mutation: null,
        changeSummary: summarizeSheetSnapshotChange(current, command.snapshot, 0),
      };
}

export async function executeSheetCommandInTransaction(
  tx: SheetTransaction,
  workspaceId: number,
  input: SheetCommand,
): Promise<SheetCommandExecution> {
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
    if (
      result.mutationId !== command.mutationId ||
      result.sheetId !== command.sheetId ||
      receipt.commandHash !== commandHash
    ) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    return resultFromReceipt(result);
  }

  if (sheet.revision !== command.baseRevision) {
    throw new SheetRevisionConflictError(command.sheetId);
  }

  const applied = applyCommand(snapshotFromSheet(sheet), command);
  const revision = command.baseRevision + 1;
  const result = commandResult(command, revision, applied.snapshot, applied.changeSummary);
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
    result: JSON.stringify(receiptFromResult(result)),
  });

  if (commit.kind === "missing") throw new SheetNotFoundError(command.sheetId);
  if (commit.kind === "replayed") {
    if (commit.commandHash !== commandHash) {
      throw new SheetMutationIdConflictError(command.mutationId);
    }
    return resultFromReceipt(parseStoredResult(commit.result));
  }
  if (commit.kind === "conflict") {
    throw new SheetRevisionConflictError(command.sheetId);
  }

  return { result, outcome: "committed" };
}

export async function executeSheetCommand(
  workspaceId: number,
  input: SheetCommand,
): Promise<SheetCommandExecution> {
  return prisma.$transaction((tx) => executeSheetCommandInTransaction(tx, workspaceId, input));
}
