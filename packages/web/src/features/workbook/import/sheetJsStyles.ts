import {
  type ExcelColorInput,
  excelBorderStyleToFortune,
  excelColorToFortune,
  excelHorizontalToFortune,
  excelVerticalToFortune,
  excelWrapToFortune,
  type FortuneCellValue,
  normalizeFortuneFormula,
} from "@openexcel/core";
import type XLSX from "xlsx-js-style";

export type SheetJsColor = ExcelColorInput;

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

export function normalizeColor(color?: SheetJsColor | string): string | undefined {
  return excelColorToFortune(color);
}

function normalizeBorderSide(side?: SheetJsBorderSide) {
  if (!side?.style) return undefined;
  const style = excelBorderStyleToFortune(side.style);
  if (!style) return undefined;
  return { s: style, c: normalizeColor(side.color) };
}

export function toFortuneValue(cell: XLSX.CellObject): FortuneCellValue {
  const rawValue = cell.v ?? "";
  const value: FortuneCellValue = {
    v: rawValue,
    m: cell.w ?? String(rawValue),
  };

  if (cell.f) value.f = normalizeFortuneFormula(cell.f);
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
    value.ht = excelHorizontalToFortune(alignment.horizontal);
  }
  if (alignment?.vertical) {
    value.vt = excelVerticalToFortune(alignment.vertical);
  }
  if (alignment?.wrapText != null) value.tb = excelWrapToFortune(alignment.wrapText);

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
