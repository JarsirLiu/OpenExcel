import type { Border, BorderStyle, Borders, Worksheet } from "exceljs";
import { fortuneBorderStyleToExcel, fortuneColorToArgb } from "../excel/fortuneStyle.js";

export type FortuneBorderSide = { s?: number; style?: number; c?: string; color?: string };

export function fortuneBorderSideToExcel(side?: FortuneBorderSide): Partial<Border> | undefined {
  if (!side) return undefined;
  const style = fortuneBorderStyleToExcel(side.s ?? side.style);
  if (!style) return undefined;
  const color = fortuneColorToArgb(side.c ?? side.color);
  return color
    ? { style: style as BorderStyle, color: { argb: color } }
    : { style: style as BorderStyle };
}

function mergeBorderSide(
  border: Partial<Borders>,
  key: "top" | "bottom" | "left" | "right",
  side: FortuneBorderSide | undefined,
): void {
  const converted = fortuneBorderSideToExcel(side);
  if (converted) border[key] = converted;
}

export function applyFortuneBorderInfo(worksheet: Worksheet, borderInfo: unknown): void {
  if (!Array.isArray(borderInfo)) return;

  for (const entry of borderInfo) {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
    const value = (entry as { value?: unknown }).value;
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;

    const borderValue = value as {
      row_index?: unknown;
      col_index?: unknown;
      t?: FortuneBorderSide;
      b?: FortuneBorderSide;
      l?: FortuneBorderSide;
      r?: FortuneBorderSide;
    };
    if (
      !Number.isInteger(borderValue.row_index) ||
      !Number.isInteger(borderValue.col_index) ||
      Number(borderValue.row_index) < 0 ||
      Number(borderValue.col_index) < 0
    ) {
      continue;
    }

    const cell = worksheet.getCell(
      Number(borderValue.row_index) + 1,
      Number(borderValue.col_index) + 1,
    );
    const border: Partial<Borders> = { ...(cell.border ?? {}) };
    mergeBorderSide(border, "top", borderValue.t);
    mergeBorderSide(border, "bottom", borderValue.b);
    mergeBorderSide(border, "left", borderValue.l);
    mergeBorderSide(border, "right", borderValue.r);
    cell.border = border;
  }
}
