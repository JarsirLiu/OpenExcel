import { type FortuneCell, type FortuneCellValue, normalizeFortuneCellData } from "@openexcel/core";

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function displayValue(value: unknown): string {
  if (value == null) return "";
  return typeof value === "string" ? value : String(value);
}

/**
 * Normalize converter output into the JSON shape accepted by the import API.
 * FortuneExcel can omit `v`/`m` for styled or empty cells and can return a
 * primitive cell value for simpler inputs. Keep all other FortuneSheet fields.
 */
export function normalizeImportedCelldata(input: unknown): FortuneCell[] {
  if (!Array.isArray(input)) return [];

  const celldata = input.map((rawCell) => {
    if (!isRecord(rawCell)) return rawCell as FortuneCell;

    const rawValue = rawCell.v;
    const value: UnknownRecord = isRecord(rawValue) ? { ...rawValue } : { v: rawValue };
    if (value.v === undefined) value.v = "";
    if (
      typeof value.v !== "string" &&
      typeof value.v !== "number" &&
      typeof value.v !== "boolean" &&
      value.v !== null
    ) {
      value.v = String(value.v);
    }
    if (value.m === undefined || value.m === null) value.m = displayValue(value.v);
    else if (typeof value.m !== "string") value.m = String(value.m);

    return {
      r: rawCell.r as number,
      c: rawCell.c as number,
      v: value as unknown as FortuneCellValue,
    };
  });

  return normalizeFortuneCellData(celldata, { inferGeneralNumeric: true });
}
