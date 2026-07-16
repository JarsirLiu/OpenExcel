import type { BorderStyle, CellFormulaValue, CellValue, Font, Style } from "exceljs";
import type { FortuneCellValue } from "../excel/celldataUtils.js";

const borderStyles: Record<number, BorderStyle> = {
  1: "thin",
  2: "medium",
  3: "thick",
  4: "double",
  5: "hair",
  6: "dashed",
  7: "dotted",
  8: "dashDot",
  9: "mediumDashed",
  10: "dotted",
  11: "mediumDashDot",
  12: "dashDotDot",
  13: "slantDashDot",
};

function normalizeArgb(color?: string): string | undefined {
  if (!color) return undefined;
  const hex = color.replace(/^#/, "");
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(hex)) return undefined;
  return (hex.length === 6 ? `FF${hex}` : hex).toUpperCase();
}

function toScalarValue(value: FortuneCellValue): CellValue {
  const raw = value.v;
  if (raw == null) return null;
  if (raw instanceof Date) return raw;

  switch (value.ct?.t) {
    case "n": {
      const numeric = typeof raw === "number" ? raw : Number(raw);
      return Number.isFinite(numeric) ? numeric : String(raw);
    }
    case "b":
      return raw === true || raw === 1 || raw === "1";
    default:
      if (typeof raw === "string" || typeof raw === "number" || typeof raw === "boolean") {
        return raw;
      }
      return String(raw);
  }
}

function toFormulaResult(value: FortuneCellValue): CellFormulaValue["result"] {
  const scalar = toScalarValue(value);
  if (scalar == null) return undefined;
  if (scalar instanceof Date) return scalar;
  if (typeof scalar === "string" || typeof scalar === "number" || typeof scalar === "boolean") {
    return scalar;
  }
  return String(scalar);
}

function toFont(value: FortuneCellValue): Partial<Font> | undefined {
  if (
    value.ff == null &&
    value.fs == null &&
    value.fc == null &&
    !value.bl &&
    !value.it &&
    !value.cl &&
    !value.un
  ) {
    return undefined;
  }

  const font: Partial<Font> = {};
  if (value.ff) font.name = value.ff;
  if (value.fs != null) font.size = value.fs;
  if (value.fc) {
    const argb = normalizeArgb(value.fc);
    if (argb) font.color = { argb };
  }
  if (value.bl) font.bold = true;
  if (value.it) font.italic = true;
  if (value.cl) font.strike = true;
  if (value.un) font.underline = "single";
  return font;
}

function toBorderSide(side?: { s: number; c?: string }):
  | {
      style: BorderStyle;
      color?: { argb: string };
    }
  | undefined {
  if (!side) return undefined;
  const style = borderStyles[side.s];
  if (!style) return undefined;
  const argb = normalizeArgb(side.c);
  return argb ? { style, color: { argb } } : { style };
}

function toStyle(value: FortuneCellValue): Partial<Style> {
  const style: Partial<Style> = {};
  const font = toFont(value);
  if (font) style.font = font;

  const background = normalizeArgb(value.bg);
  if (background) {
    style.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: background },
    };
  }

  if (value.ht != null || value.vt != null || value.tb != null) {
    style.alignment = {};
    if (value.ht === 0) style.alignment.horizontal = "left";
    if (value.ht === 1) style.alignment.horizontal = "center";
    if (value.ht === 2) style.alignment.horizontal = "right";
    if (value.vt === 0) style.alignment.vertical = "top";
    if (value.vt === 1) style.alignment.vertical = "middle";
    if (value.vt === 2) style.alignment.vertical = "bottom";
    if (value.tb != null) style.alignment.wrapText = value.tb === "1";
  }

  if (value.ct?.fa) style.numFmt = value.ct.fa;

  if (value.bd) {
    const border = {
      top: toBorderSide(value.bd.t),
      bottom: toBorderSide(value.bd.b),
      left: toBorderSide(value.bd.l),
      right: toBorderSide(value.bd.r),
    };
    if (Object.values(border).some(Boolean)) style.border = border;
  }

  return style;
}

export function applyFortuneCell(
  cell: { value: CellValue; style: Partial<Style> },
  value: FortuneCellValue,
) {
  const hasFormula = typeof value.f === "string" && value.f.trim().length > 0;
  cell.value = hasFormula
    ? { formula: value.f!.replace(/^=/, ""), result: toFormulaResult(value) }
    : toScalarValue(value);
  Object.assign(cell.style, toStyle(value));
}
