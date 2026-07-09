import type { FortuneCell } from "@openexcel/core";
import type { Prisma } from "../../infra/database/prismaTypes.js";

export type SheetRecord = Prisma.SheetGetPayload<{}>;

function safeParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function parseUploadedCelldata(
  uploadedData: string | null | undefined,
): FortuneCell[] | null {
  const parsed = safeParse<unknown>(uploadedData, null);
  if (!Array.isArray(parsed)) {
    return null;
  }
  return parsed as FortuneCell[];
}

export function sheetRecordToCelldata(sheet: Pick<SheetRecord, "uploadedData">): FortuneCell[] {
  const uploadedData = parseUploadedCelldata(sheet.uploadedData);
  if (uploadedData && uploadedData.length > 0) {
    return uploadedData;
  }
  return uploadedData ?? [];
}

export function celldataToGridShape(celldata: FortuneCell[]): string[][] {
  if (celldata.length === 0) {
    return [];
  }
  const maxRow = Math.max(...celldata.map((cell) => cell.r), 0);
  const maxCol = Math.max(...celldata.map((cell) => cell.c), 0);
  const width = maxCol + 1;
  const grid: string[][] = Array.from({ length: maxRow + 1 }, () => Array(width).fill(""));
  for (const cell of celldata) {
    if (!grid[cell.r]) continue;
    grid[cell.r][cell.c] = String(cell.v?.v ?? "");
  }
  return grid;
}
