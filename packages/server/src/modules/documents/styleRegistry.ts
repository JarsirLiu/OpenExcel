import {
  type CanonicalCellStyle,
  cellStyleId,
  type DocumentStyleDefinition,
  decodeDocumentJson,
  encodeDocumentJson,
  normalizeCellStyle,
} from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";

type StyleClient = Pick<Prisma.TransactionClient, "cellStyle">;

export function normalizeStyleDefinitions(
  definitions: DocumentStyleDefinition[] = [],
): DocumentStyleDefinition[] {
  const normalized = new Map<string, DocumentStyleDefinition>();
  for (const definition of definitions) {
    const style = normalizeCellStyle(definition.style);
    if (!style || cellStyleId(style) !== definition.id) continue;
    normalized.set(definition.id, { id: definition.id, style });
  }
  return [...normalized.values()];
}

export async function registerCellStyles(
  client: StyleClient,
  workbookId: number,
  definitions: DocumentStyleDefinition[],
): Promise<void> {
  const rows = normalizeStyleDefinitions(definitions).map((definition) => ({
    workbookId,
    hash: definition.id,
    data: encodeDocumentJson(definition.style),
  }));
  for (const row of rows) {
    await client.cellStyle.upsert({
      where: { workbookId_hash: { workbookId: row.workbookId, hash: row.hash } },
      create: row,
      update: { data: row.data },
    });
  }
}

export async function loadCellStyles(
  client: StyleClient,
  workbookId: number,
  styleIds: Iterable<string>,
): Promise<Map<string, CanonicalCellStyle>> {
  const ids = [...new Set(styleIds)];
  if (ids.length === 0) return new Map();
  const rows = await client.cellStyle.findMany({
    where: { workbookId, hash: { in: ids } },
    select: { hash: true, data: true },
  });
  return new Map(rows.map((row) => [row.hash, decodeDocumentJson<CanonicalCellStyle>(row.data)]));
}
