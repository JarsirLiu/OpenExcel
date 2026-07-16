import type { CellFormulaValue, CellValue, Font, Style } from "exceljs";
import type { FortuneCellValue } from "../excel/celldataUtils.js";
import { fortuneCellValueToScalar, normalizeFortuneFormula } from "../excel/fortuneCellValue.js";
import {
  fortuneColorToArgb,
  fortuneHorizontalToExcel,
  fortuneVerticalToExcel,
  fortuneWrapToExcel,
} from "../excel/fortuneStyle.js";
import { fortuneBorderSideToExcel } from "./excelJsBorder.js";

function toScalarValue(value: FortuneCellValue): CellValue {
  return fortuneCellValueToScalar(value);
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
    const argb = fortuneColorToArgb(value.fc);
    if (argb) font.color = { argb };
  }
  if (value.bl) font.bold = true;
  if (value.it) font.italic = true;
  if (value.cl) font.strike = true;
  if (value.un) font.underline = "single";
  return font;
}

function toStyle(value: FortuneCellValue): Partial<Style> {
  const style: Partial<Style> = {};
  const font = toFont(value);
  if (font) style.font = font;

  const background = fortuneColorToArgb(value.bg);
  if (background) {
    style.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: background },
    };
  }

  if (value.ht != null || value.vt != null || value.tb != null) {
    style.alignment = {};
    const horizontal = fortuneHorizontalToExcel(value.ht);
    const vertical = fortuneVerticalToExcel(value.vt);
    const wrapText = fortuneWrapToExcel(value.tb);
    if (horizontal) style.alignment.horizontal = horizontal;
    if (vertical) style.alignment.vertical = vertical;
    if (wrapText != null) style.alignment.wrapText = wrapText;
  }

  if (value.ct?.fa) style.numFmt = value.ct.fa;

  if (value.bd) {
    const border = {
      top: fortuneBorderSideToExcel(value.bd.t),
      bottom: fortuneBorderSideToExcel(value.bd.b),
      left: fortuneBorderSideToExcel(value.bd.l),
      right: fortuneBorderSideToExcel(value.bd.r),
    };
    if (Object.values(border).some(Boolean)) style.border = border;
  }

  return style;
}

export function applyFortuneCell(
  cell: { value: CellValue; style: Partial<Style> },
  value: FortuneCellValue,
) {
  const formula = normalizeFortuneFormula(value.f);
  cell.value = formula ? { formula, result: toFormulaResult(value) } : toScalarValue(value);
  Object.assign(cell.style, toStyle(value));
}
