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
    merges: string;
    uploadedData: string;
    config: string | null;
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
      merges: input.merges,
      uploadedData: input.uploadedData,
      config: input.config,
      revision: { increment: 1 },
    },
  });
  if (updated.count === 0) {
    return { kind: "conflict" };
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
  merges: string;
  uploadedData: string;
  config: string | null;
  mutationId: string;
  commandHash: string;
  result: string;
}): Promise<SheetCommandCommit> {
  return prisma.$transaction((tx) => commitSheetCommandInTransaction(tx, input));
}
