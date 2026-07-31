import {
  applySheetMutation,
  cloneSheetSnapshot,
  normalizeFortuneCellData,
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
  mutationChunkRanges,
  type SheetChunkRange,
  serializeSheetChunks,
  snapshotFromSheetChunks,
} from "../../../shared/utils/sheetChunks.js";
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

function chunkWhere(sheetId: number, ranges: readonly SheetChunkRange[]) {
  if (ranges.length === 1) {
    const [range] = ranges;
    return {
      sheetId,
      chunkRow: { gte: range.chunkRow, lte: range.endChunkRow },
      chunkCol: { gte: range.chunkCol, lte: range.endChunkCol },
    };
  }
  return {
    sheetId,
    OR: ranges.map(({ chunkRow, chunkCol, endChunkRow, endChunkCol }) => ({
      chunkRow: { gte: chunkRow, lte: endChunkRow },
      chunkCol: { gte: chunkCol, lte: endChunkCol },
    })),
  };
}

async function findMutationChunks(
  tx: SheetTransaction,
  sheetId: number,
  ranges: readonly SheetChunkRange[],
) {
  const chunks: Array<{ chunkRow: number; chunkCol: number; payload: string }> = [];
  const batchSize = 64;
  for (let index = 0; index < ranges.length; index += batchSize) {
    const batch = ranges.slice(index, index + batchSize);
    chunks.push(...(await tx.sheetChunk.findMany({ where: chunkWhere(sheetId, batch) })));
  }
  return chunks;
}

function chunkUpdatesForSnapshot(
  snapshot: SheetSnapshot,
  ranges: readonly SheetChunkRange[],
  existingChunks: readonly { chunkRow: number; chunkCol: number }[],
  onlyExisting: boolean,
) {
  const serialized = serializeSheetChunks(snapshot.celldata);
  const serializedByKey = new Map(
    serialized.map((chunk) => [`${chunk.chunkRow},${chunk.chunkCol}`, chunk.payload]),
  );
  const updatesByKey = new Map<
    string,
    { chunkRow: number; chunkCol: number; payload: string | null }
  >();
  const coordinates = onlyExisting
    ? existingChunks
    : ranges.flatMap((range) => {
        const result: Array<{ chunkRow: number; chunkCol: number }> = [];
        for (let chunkRow = range.chunkRow; chunkRow <= range.endChunkRow; chunkRow += 1) {
          for (let chunkCol = range.chunkCol; chunkCol <= range.endChunkCol; chunkCol += 1) {
            result.push({ chunkRow, chunkCol });
          }
        }
        return result;
      });
  for (const { chunkRow, chunkCol } of coordinates) {
    updatesByKey.set(`${chunkRow},${chunkCol}`, {
      chunkRow,
      chunkCol,
      payload: serializedByKey.get(`${chunkRow},${chunkCol}`) ?? null,
    });
  }
  return [...updatesByKey.values()];
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

  let applied: ReturnType<typeof applyCommand>;
  let chunks: Array<{ chunkRow: number; chunkCol: number; payload: string | null }>;
  let replaceAllChunks = false;

  if (command.kind === "mutation") {
    const ranges = mutationChunkRanges(command.mutation);
    const storedChunks =
      ranges.length > 0 ? await findMutationChunks(tx, command.sheetId, ranges) : [];
    const current = snapshotFromSheetChunks(storedChunks, parseConfig(sheet.config), false);
    applied = applyCommand(current, command);
    applied.snapshot.celldata = normalizeFortuneCellData(applied.snapshot.celldata);
    chunks = chunkUpdatesForSnapshot(
      applied.snapshot,
      ranges,
      storedChunks,
      command.mutation.type === "clear" || command.mutation.type === "unmerge",
    );
  } else {
    const storedChunks = await tx.sheetChunk.findMany({ where: { sheetId: command.sheetId } });
    const current = snapshotFromSheetChunks(storedChunks, parseConfig(sheet.config));
    applied = applyCommand(current, command);
    chunks = serializeSheetChunks(applied.snapshot.celldata).map((chunk) => ({
      ...chunk,
      payload: chunk.payload,
    }));
    replaceAllChunks = true;
  }
  const revision = command.baseRevision + 1;
  const result = commandResult(command, revision, applied.snapshot, applied.changeSummary);
  const commit = await commitSheetCommandInTransaction(tx, {
    sheetId: command.sheetId,
    workspaceId,
    baseRevision: command.baseRevision,
    config: applied.snapshot.config ? JSON.stringify(applied.snapshot.config) : null,
    chunks,
    replaceAllChunks,
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
