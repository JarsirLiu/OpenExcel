import type { Prisma } from "@prisma/client";

export interface SheetJson {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  uploadedData: any[] | null;
  config: any | null;
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
    name: sheet.name,
    columns: safeParse(sheet.columns, []),
    merges: safeParse(sheet.merges, []),
    uploadedData: sheet.uploadedData ? safeParse(sheet.uploadedData, null) : null,
    config: sheet.config ? safeParse(sheet.config, null) : null,
  };
}
