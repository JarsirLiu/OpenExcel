import type { Prisma } from "../../infra/database/prismaTypes.js";
import { sheetRecordToSnapshot, snapshotMergesJson } from "./sheetSnapshot.js";

export interface SheetJson {
  id: number;
  sheetNo: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  uploadedData: any[] | null;
  config: any | null;
  revision: number;
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function deserializeSheet(sheet: Prisma.SheetGetPayload<{}>): SheetJson {
  const snapshot = sheetRecordToSnapshot(sheet);
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    name: sheet.name,
    columns: safeParse(sheet.columns, []),
    merges: safeParse(snapshotMergesJson(snapshot), []),
    uploadedData: snapshot.celldata,
    config: snapshot.config,
    revision: sheet.revision,
  };
}
