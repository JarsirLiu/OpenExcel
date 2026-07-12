import type { Prisma } from "../../infra/database/prismaTypes.js";

export interface SheetMetadata {
  id: number;
  sheetNo: number;
  name: string;
  columns: { label: string; width?: number }[];
  config: any | null;
  documentFormat: string;
  documentVersion: number;
  documentRevision: number;
  maxRow: number;
  maxColumn: number;
}

type SheetMetadataRecord = Pick<
  Prisma.SheetGetPayload<{}>,
  | "id"
  | "sheetNo"
  | "name"
  | "columns"
  | "config"
  | "documentFormat"
  | "documentVersion"
  | "documentRevision"
  | "maxRow"
  | "maxColumn"
>;

function safeParse<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function deserializeSheetMetadata(sheet: Prisma.SheetGetPayload<{}>): SheetMetadata {
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    name: sheet.name,
    columns: safeParse(sheet.columns, []),
    config: sheet.config ? safeParse(sheet.config, null) : null,
    documentFormat: sheet.documentFormat,
    documentVersion: sheet.documentVersion,
    documentRevision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
  };
}

export function deserializeSheetMetadataRecord(sheet: SheetMetadataRecord): SheetMetadata {
  return {
    id: sheet.id,
    sheetNo: sheet.sheetNo,
    name: sheet.name,
    columns: safeParse(sheet.columns, []),
    config: sheet.config ? safeParse(sheet.config, null) : null,
    documentFormat: sheet.documentFormat,
    documentVersion: sheet.documentVersion,
    documentRevision: sheet.documentRevision,
    maxRow: sheet.maxRow,
    maxColumn: sheet.maxColumn,
  };
}
