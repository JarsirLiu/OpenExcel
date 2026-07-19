import type { ExcelColorInput } from "../excel/fortuneStyle.js";

type RecordValue = Record<string, unknown>;

export type SheetJsStyle = {
  font?: {
    name?: string;
    sz?: number;
    bold?: boolean;
    italic?: boolean;
    strike?: boolean;
    underline?: boolean;
    color?: ExcelColorInput;
  };
  fill?: { fgColor?: ExcelColorInput };
  alignment?: { horizontal?: string; vertical?: string; wrapText?: boolean };
  border?: {
    top?: SheetJsBorderSide;
    bottom?: SheetJsBorderSide;
    left?: SheetJsBorderSide;
    right?: SheetJsBorderSide;
  };
};

export type SheetJsBorderSide = {
  style?: string | number;
  color?: ExcelColorInput;
};

function isRecord(value: unknown): value is RecordValue {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toColor(value: unknown): ExcelColorInput | undefined {
  if (!isRecord(value)) return undefined;

  const color: ExcelColorInput = {};
  if (typeof value.rgb === "string") color.rgb = value.rgb;
  if (typeof value.indexed === "number") color.indexed = value.indexed;
  if (typeof value.theme === "number") color.theme = value.theme;
  if (typeof value.tint === "number") color.tint = value.tint;
  return Object.keys(color).length > 0 ? color : undefined;
}

function toFill(style: RecordValue): SheetJsStyle["fill"] {
  const nestedFill = isRecord(style.fill) ? style.fill : undefined;
  const nestedForeground = nestedFill ? toColor(nestedFill.fgColor) : undefined;
  if (nestedForeground) return { fgColor: nestedForeground };

  // BIFF-style files are returned by xlsx-js-style with the fill fields
  // flattened directly on cell.s instead of under cell.s.fill.
  if (style.patternType === "solid") {
    const foreground = toColor(style.fgColor);
    return foreground ? { fgColor: foreground } : undefined;
  }

  return undefined;
}

export function normalizeSheetJsStyle(input: unknown): SheetJsStyle | undefined {
  if (!isRecord(input)) return undefined;

  const fill = toFill(input);
  const style: SheetJsStyle = {
    fill,
    font: isRecord(input.font) ? (input.font as SheetJsStyle["font"]) : undefined,
    alignment: isRecord(input.alignment)
      ? (input.alignment as SheetJsStyle["alignment"])
      : undefined,
    border: isRecord(input.border) ? (input.border as SheetJsStyle["border"]) : undefined,
  };

  return Object.values(style).some((value) => value != null) ? style : undefined;
}
