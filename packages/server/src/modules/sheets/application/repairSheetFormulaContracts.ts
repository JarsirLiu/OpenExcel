import { normalizeFortuneCellValue } from "@openexcel/core";
import { withDatabaseWriteLock } from "../../../infra/database/databaseConcurrency.js";
import { prisma } from "../../../infra/database/db.js";
import type { Prisma } from "../../../infra/database/prismaTypes.js";
import { parseSheetChunkPayload } from "../../../shared/utils/sheetChunks.js";

function normalizePayload(payload: string): string {
  const cells = parseSheetChunkPayload(payload).map((cell) => ({
    ...cell,
    v: normalizeFortuneCellValue(cell.v),
  }));
  return JSON.stringify({ celldata: cells });
}

function removePersistedCalcChain(value: string | null): string | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return value;
  const config = { ...(parsed as Record<string, unknown>) };
  if (!("calcChain" in config)) return value;
  delete config.calcChain;
  return Object.keys(config).length > 0 ? JSON.stringify(config) : null;
}

export type SheetFormulaRepairResult = {
  sheetsScanned: number;
  sheetsChanged: number;
  chunksChanged: number;
};

export async function repairSheetFormulaContractsInDatabase(
  tx: Prisma.TransactionClient,
): Promise<SheetFormulaRepairResult> {
  const sheets = await tx.sheet.findMany({ include: { chunks: true } });
  const result: SheetFormulaRepairResult = {
    sheetsScanned: sheets.length,
    sheetsChanged: 0,
    chunksChanged: 0,
  };

  for (const sheet of sheets) {
    const updates = sheet.chunks
      .map((chunk) => ({
        chunk,
        payload: normalizePayload(chunk.payload),
      }))
      .filter(({ chunk, payload }) => payload !== chunk.payload);
    const config = removePersistedCalcChain(sheet.config);
    const configChanged = config !== sheet.config;
    if (updates.length === 0 && !configChanged) continue;

    const revision = sheet.revision + 1;
    await tx.sheet.update({
      where: { id: sheet.id },
      data: { config, revision },
    });
    for (const { chunk, payload } of updates) {
      await tx.sheetChunk.update({
        where: { id: chunk.id },
        data: { payload, contentRevision: revision },
      });
    }
    result.sheetsChanged += 1;
    result.chunksChanged += updates.length;
  }

  return result;
}

export async function repairSheetFormulaContracts(): Promise<SheetFormulaRepairResult> {
  return withDatabaseWriteLock(() =>
    prisma.$transaction((tx) => repairSheetFormulaContractsInDatabase(tx)),
  );
}
