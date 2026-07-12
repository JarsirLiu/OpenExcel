import type { FortuneCell } from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";

export interface SheetJson {
  id: number;
  sheetNo: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  uploadedData: FortuneCell[] | null;
  config: any | null;
  documentFormat: string;
  documentVersion: number;
  documentRevision: number;
  maxRow: number;
  maxColumn: number;
}

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function deserializeSheet(sheet: Prisma.SheetGetPayload<{}>): SheetJson {
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    name: sheet.name,
    columns: safeParse(sheet.columns, []),
    merges: safeParse(sheet.merges, []),
    uploadedData: sheet.uploadedData ? safeParse(sheet.uploadedData, null) : null,
    config: sheet.config ? safeParse(sheet.config, null) : null,
    documentFormat: sheet.documentFormat,
    documentVersion: sheet.documentVersion,
    documentRevision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
  };
}
