import { withDatabaseWriteLock } from "../../../infra/database/databaseConcurrency.js";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";

export async function findSheetMutationReceipt(mutationId: string) {
  return prisma.sheetMutationReceipt.findUnique({ where: { mutationId } });
}

export type SheetCommandCommit =
  | { kind: "missing" }
  | { kind: "conflict" }
  | { kind: "committed"; revision: number }
  | { kind: "replayed"; commandHash: string; result: string };

export async function commitSheetCommandInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    sheetId: number;
    workspaceId: number;
    baseRevision: number;
    config: string | null;
    chunks: Array<{ chunkRow: number; chunkCol: number; payload: string | null }>;
    replaceAllChunks: boolean;
    mutationId: string;
    commandHash: string;
    result: string;
  },
): Promise<SheetCommandCommit> {
  const sheet = await tx.sheet.findFirst({
    where: { id: input.sheetId, workbook: { workspaceId: input.workspaceId } },
    select: { id: true, revision: true },
  });
  if (!sheet) return { kind: "missing" };

  const existing = await tx.sheetMutationReceipt.findUnique({
    where: { mutationId: input.mutationId },
  });
  if (existing) {
    return {
      kind: "replayed",
      commandHash: existing.commandHash,
      result: existing.result,
    };
  }

  const updated = await tx.sheet.updateMany({
    where: { id: sheet.id, revision: input.baseRevision },
    data: {
      config: input.config,
      revision: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    return { kind: "conflict" };
  }

  if (input.replaceAllChunks) {
    await tx.sheetChunk.deleteMany({ where: { sheetId: input.sheetId } });
  }

  for (const chunk of input.chunks) {
    if (chunk.payload === null) {
      await tx.sheetChunk.deleteMany({
        where: {
          sheetId: input.sheetId,
          chunkRow: chunk.chunkRow,
          chunkCol: chunk.chunkCol,
        },
      });
      continue;
    }
    await tx.sheetChunk.upsert({
      where: {
        sheetId_chunkRow_chunkCol: {
          sheetId: input.sheetId,
          chunkRow: chunk.chunkRow,
          chunkCol: chunk.chunkCol,
        },
      },
      create: {
        sheetId: input.sheetId,
        chunkRow: chunk.chunkRow,
        chunkCol: chunk.chunkCol,
        payload: chunk.payload,
        contentRevision: input.baseRevision + 1,
      },
      update: {
        payload: chunk.payload,
        contentRevision: input.baseRevision + 1,
      },
    });
  }

  await tx.sheetMutationReceipt.create({
    data: {
      mutationId: input.mutationId,
      commandHash: input.commandHash,
      sheetId: input.sheetId,
      baseRevision: input.baseRevision,
      revision: input.baseRevision + 1,
      result: input.result,
    },
  });
  return { kind: "committed", revision: input.baseRevision + 1 };
}

export async function commitSheetCommand(input: {
  sheetId: number;
  workspaceId: number;
  baseRevision: number;
  config: string | null;
  chunks: Array<{ chunkRow: number; chunkCol: number; payload: string | null }>;
  replaceAllChunks: boolean;
  mutationId: string;
  commandHash: string;
  result: string;
}): Promise<SheetCommandCommit> {
  return withDatabaseWriteLock(() =>
    prisma.$transaction((tx) => commitSheetCommandInTransaction(tx, input)),
  );
}
