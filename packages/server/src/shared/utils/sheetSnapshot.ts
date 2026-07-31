import { extractMergesFromCelldata, type SheetSnapshot } from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";
import { snapshotFromSheetChunks } from "./sheetChunks.js";

type PersistedSheet = Pick<Prisma.SheetGetPayload<{}>, "config"> & {
  chunks: readonly { payload: string }[];
};

function parseConfig(value: string | null): Record<string, unknown> | null {
  if (!value) return null;
  const parsed: unknown = JSON.parse(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid Sheet config: expected an object");
  }
  return parsed as Record<string, unknown>;
}

export function sheetRecordToSnapshot(sheet: PersistedSheet): SheetSnapshot {
  return snapshotFromSheetChunks(sheet.chunks, parseConfig(sheet.config));
}

export function snapshotMergesJson(snapshot: SheetSnapshot): string {
  return JSON.stringify(extractMergesFromCelldata(snapshot.celldata));
}

export function serializeSheetSnapshot(snapshot: SheetSnapshot): {
  celldata: string;
  config: string | null;
} {
  return {
    celldata: JSON.stringify(snapshot.celldata),
    config: snapshot.config ? JSON.stringify(snapshot.config) : null,
  };
}

export function runSnapshotToSheetSnapshot(
  uploadedData: string | null,
  config: string | null,
): SheetSnapshot {
  let celldata: unknown = [];
  try {
    celldata = uploadedData ? JSON.parse(uploadedData) : [];
  } catch {
    celldata = [];
  }
  return {
    celldata: Array.isArray(celldata) ? celldata : [],
    config: parseConfig(config),
  } as SheetSnapshot;
}
