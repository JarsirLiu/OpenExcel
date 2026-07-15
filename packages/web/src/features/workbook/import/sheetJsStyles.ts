import type { FortuneCellValue } from "@openexcel/core";
import type XLSX from "xlsx-js-style";

export type SheetJsColor = {
  rgb?: string;
  indexed?: number;
  theme?: number;
  tint?: number;
};

export type SheetJsStyle = {
  font?: {
    name?: string;
    sz?: number;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    underline?: boolean;
    color?: SheetJsColor;
  };
  fill?: { fgColor?: SheetJsColor };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: SheetJsBorderSide;
    bottom?: SheetJsBorderSide;
    left?: SheetJsBorderSide;
    right?: SheetJsBorderSide;
  };
};

type SheetJsBorderSide = {
  style?: string | number;
  color?: SheetJsColor;
};

const indexedColors: Record<number, string> = {
  0: "#000000",
  1: "#FFFFFF",
  2: "#FF0000",
  3: "#00FF00",
  4: "#0000FF",
  5: "#FFFF00",
  6: "#FF00FF",
  7: "#00FFFF",
  8: "#000000",
  9: "#FFFFFF",
};

const themeColors: Record<number, string> = {
  0: "#000000",
  1: "#FFFFFF",
  2: "#1F497D",
  3: "#EEECE1",
  4: "#4F81BD",
  5: "#C0504D",
  6: "#9BBB59",
  7: "#8064A2",
  8: "#4BACC6",
  9: "#F79646",
};

function applyTint(hex: string, tint?: number): string {
  if (tint == null || tint === 0) return hex;
  const value = Number.parseInt(hex.slice(1), 16);
  const channels = [value >> 16, (value >> 8) & 0xff, value & 0xff].map((channel) =>
    tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint,
  );
  return `#${channels
    .map((channel) => Math.round(channel).toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase()}`;
}

export function normalizeColor(color?: SheetJsColor | string): string | undefined {
  if (!color) return undefined;
  if (typeof color === "string") {
    return color.startsWith("#") ? color : `#${color.slice(-6)}`;
  }
  const hex = color.rgb
    ? `#${color.rgb.slice(-6)}`
    : color.indexed != null
      ? indexedColors[color.indexed]
      : color.theme != null
        ? themeColors[color.theme]
        : undefined;
  return hex ? applyTint(hex, color.tint) : undefined;
}

const borderStyles: Record<string, number> = {
  thin: 1,
  medium: 2,
  thick: 3,
  double: 4,
  hair: 5,
  dashed: 6,
  dotted: 7,
  dashDot: 8,
  mediumDashed: 9,
  mediumDotted: 10,
  mediumDashDot: 11,
  mediumDashDotDot: 12,
  dashDotDot: 12,
  slantDashDot: 13,
};

function normalizeBorderSide(side?: SheetJsBorderSide) {
  if (!side?.style) return undefined;
  const style = typeof side.style === "number" ? side.style : borderStyles[side.style];
  if (!style) return undefined;
  return { s: style, c: normalizeColor(side.color) };
}

export function toFortuneValue(cell: XLSX.CellObject): FortuneCellValue {
  const rawValue = cell.v ?? "";
  const value: FortuneCellValue = {
    v: rawValue,
    m: cell.w ?? String(rawValue),
  };

  if (cell.f) value.f = cell.f;
  if (cell.z) value.ct = { fa: String(cell.z), t: cell.t };

  const style = cell.s as SheetJsStyle | undefined;
  if (style?.font) {
    value.ff = style.font.name;
    value.fs = style.font.sz;
    value.bl = style.font.bold ? 1 : undefined;
    value.it = style.font.italic ? 1 : undefined;
    value.cl = style.font.strike ? 1 : undefined;
    value.un = style.font.underline ? 1 : undefined;
    value.fc = normalizeColor(style.font.color);
  }
  value.bg = normalizeColor(style?.fill?.fgColor);

  const alignment = style?.alignment;
  if (alignment?.horizontal) {
    value.ht = { left: 0, center: 1, right: 2 }[alignment.horizontal];
  }
  if (alignment?.vertical) {
    value.vt = { top: 0, center: 1, bottom: 2 }[alignment.vertical];
  }
  if (alignment?.wrapText != null) value.tb = alignment.wrapText ? "1" : "0";

  const border = style?.border;
  if (border) {
    const normalizedBorder = {
      t: normalizeBorderSide(border.top),
      b: normalizeBorderSide(border.bottom),
      l: normalizeBorderSide(border.left),
      r: normalizeBorderSide(border.right),
    };
    if (Object.values(normalizedBorder).some(Boolean)) value.bd = normalizedBorder;
  }

  return value;
}
