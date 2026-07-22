import {
  applySheetMutation,
  extractMergesFromCelldata,
  type SheetChangeRangeOperation,
  type SheetSnapshot,
} from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";
import { sheetRecordToCelldata } from "./sheetData.js";

type PersistedSheet = Pick<Prisma.SheetGetPayload<{}>, "uploadedData" | "config" | "merges">;

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

function parseLegacyMerges(value: string): SheetChangeRangeOperation[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];

    return parsed.flatMap((entry): SheetChangeRangeOperation[] => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
      const merge = entry as { row?: unknown; col?: unknown };
      if (
        !Array.isArray(merge.row) ||
        !Array.isArray(merge.col) ||
        merge.row.length !== 2 ||
        merge.col.length !== 2 ||
        !merge.row.every((value) => Number.isInteger(value) && value >= 0) ||
        !merge.col.every((value) => Number.isInteger(value) && value >= 0)
      ) {
        return [];
      }

      const [startRow, endRow] = merge.row as [number, number];
      const [startCol, endCol] = merge.col as [number, number];
      if (endRow < startRow || endCol < startCol) return [];

      return [
        {
          type: "range",
          startRow: startRow + 1,
          startCol: startCol + 1,
          endRow: endRow + 1,
          endCol: endCol + 1,
        },
      ];
    });
  } catch {
    return [];
  }
}

export function sheetRecordToSnapshot(sheet: PersistedSheet): SheetSnapshot {
  const snapshot: SheetSnapshot = {
    celldata: sheetRecordToCelldata(sheet),
    config: parseConfig(sheet.config),
  };
  const canonicalMerges = extractMergesFromCelldata(snapshot.celldata);
  const legacyMerges = parseLegacyMerges(sheet.merges);

  if (canonicalMerges.length > 0 || legacyMerges.length === 0) {
    return snapshot;
  }

  // Legacy rows are read only here; all writes derive the legacy column again
  // from the canonical cell model, so unmerge cannot resurrect stale metadata.
  return applySheetMutation(snapshot, {
    type: "merge",
    operations: legacyMerges,
  }).snapshot;
}

export function snapshotMergesJson(snapshot: SheetSnapshot): string {
  return JSON.stringify(extractMergesFromCelldata(snapshot.celldata));
}

export function serializeSheetSnapshot(snapshot: SheetSnapshot): {
  uploadedData: string;
  config: string | null;
  merges: string;
} {
  return {
    uploadedData: JSON.stringify(snapshot.celldata),
    config: snapshot.config ? JSON.stringify(snapshot.config) : null,
    merges: snapshotMergesJson(snapshot),
  };
}

export function runSnapshotToSheetSnapshot(
  uploadedData: string | null,
  config: string | null,
): SheetSnapshot {
  return sheetRecordToSnapshot({ uploadedData, config, merges: "[]" });
}
