import type { Prisma } from "@prisma/client";

export interface SheetJson {
  id: number;
  name: string;
  columns: { label: string; width?: number }[];
  merges: { row: [number, number]; col: [number, number] }[];
  rows: string[][];
  uploadedData: any[] | null;
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
    rows: safeParse(sheet.rows, []),
    uploadedData: sheet.uploadedData ? safeParse(sheet.uploadedData, null) : null,
  };
}

export function serializeSheetData(data: { columns: any[]; merges: any[]; rows: any[][] }): {
  columns: string;
  merges: string;
  rows: string;
} {
  return {
    columns: JSON.stringify(data.columns),
    merges: JSON.stringify(data.merges),
    rows: JSON.stringify(data.rows),
  };
}

export function cloneSheetSchema(sheet: { columns: string; merges: string; rows: string }) {
  const columns = safeParse<{ label: string; width?: number }[]>(sheet.columns, []);
  const merges = safeParse<{ row: [number, number]; col: [number, number] }[]>(sheet.merges, []);
  const rows = safeParse<string[][]>(sheet.rows, []);

  return {
    columns: JSON.stringify(columns),
    merges: JSON.stringify(merges),
    rows: JSON.stringify(rows.map((row) => row.map(() => ""))),
  };
}