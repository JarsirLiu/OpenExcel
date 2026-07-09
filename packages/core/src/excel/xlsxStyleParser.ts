import { unzipSync } from "fflate";
import XLSX from "xlsx-js-style";

type ParsedStyle = Record<string, any>;

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function parseAttributes(fragment: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  fragment.replace(/([:\w-]+)="([^"]*)"/g, (_match, key: string, rawValue: string) => {
    attrs[key] = decodeXmlEntities(rawValue);
    return "";
  });
  return attrs;
}

function getSection(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`));
  return match?.[1] ?? null;
}

function parseCustomNumFmts(xml: string): Map<number, string> {
  const map = new Map<number, string>();
  const section = getSection(xml, "numFmts");
  if (!section) return map;

  for (const match of section.matchAll(/<numFmt\b([^/>]*)\/>/g)) {
    const attrs = parseAttributes(match[1]);
    const id = Number(attrs.numFmtId);
    if (!Number.isFinite(id) || !attrs.formatCode) continue;
    map.set(id, attrs.formatCode);
  }

  return map;
}

function parseFonts(xml: string): ParsedStyle[] {
  const section = getSection(xml, "fonts");
  if (!section) return [];

  const fonts: ParsedStyle[] = [];
  for (const match of section.matchAll(/<font>([\s\S]*?)<\/font>/g)) {
    const fontXml = match[1];
    const font: ParsedStyle = {};

    if (/<b\b[^>]*\/?>/.test(fontXml)) font.bold = true;
    if (/<i\b[^>]*\/?>/.test(fontXml)) font.italic = true;
    if (/<strike\b[^>]*\/?>/.test(fontXml)) font.strike = true;
    if (/<u\b[^>]*\/?>/.test(fontXml)) font.underline = true;

    const sizeMatch = fontXml.match(/<sz\b[^>]*val="([^"]+)"/);
    if (sizeMatch) {
      const size = Number(sizeMatch[1]);
      if (Number.isFinite(size)) font.sz = size;
    }

    const nameMatch = fontXml.match(/<name\b[^>]*val="([^"]+)"/);
    if (nameMatch) font.name = decodeXmlEntities(nameMatch[1]);

    const colorMatch = fontXml.match(/<color\b[^>]*rgb="([^"]+)"/);
    if (colorMatch) font.color = { rgb: colorMatch[1] };

    fonts.push(font);
  }

  return fonts;
}

function parseFills(xml: string): ParsedStyle[] {
  const section = getSection(xml, "fills");
  if (!section) return [];

  const fills: ParsedStyle[] = [];
  for (const match of section.matchAll(/<fill>([\s\S]*?)<\/fill>/g)) {
    const fillXml = match[1];
    const patternMatch = fillXml.match(
      /<patternFill\b([^>]*)>([\s\S]*?)<\/patternFill>|<patternFill\b([^>]*)\/>/,
    );
    if (!patternMatch) {
      fills.push({});
      continue;
    }

    const attrs = parseAttributes(patternMatch[1] ?? patternMatch[3] ?? "");
    const inner = patternMatch[2] ?? "";
    const fgColorMatch =
      inner.match(/<fgColor\b[^>]*rgb="([^"]+)"/) ??
      patternMatch[1]?.match(/<fgColor\b[^>]*rgb="([^"]+)"/);
    const fill: ParsedStyle = {};
    if (attrs.patternType) fill.patternType = attrs.patternType;
    if (fgColorMatch) fill.fgColor = { rgb: fgColorMatch[1] };

    fills.push(fill);
  }

  return fills;
}

function parseBorderSide(sideXml: string): ParsedStyle | undefined {
  const attrsMatch = sideXml.match(/^<([a-z]+)\b([^>]*)>([\s\S]*?)<\/\1>$|^<([a-z]+)\b([^>]*)\/>$/);
  if (!attrsMatch) return undefined;

  const attrs = parseAttributes(attrsMatch[2] ?? attrsMatch[5] ?? "");
  const inner = attrsMatch[3] ?? "";
  const side: ParsedStyle = {};

  if (attrs.style) side.style = attrs.style;

  const colorMatch = inner.match(/<color\b[^>]*rgb="([^"]+)"/);
  if (colorMatch) side.color = { rgb: colorMatch[1] };

  return Object.keys(side).length > 0 ? side : undefined;
}

function parseBorders(xml: string): ParsedStyle[] {
  const section = getSection(xml, "borders");
  if (!section) return [];

  const borders: ParsedStyle[] = [];
  for (const match of section.matchAll(/<border>([\s\S]*?)<\/border>/g)) {
    const borderXml = match[1];
    const border: ParsedStyle = {};
    const sides: Array<["top" | "bottom" | "left" | "right", RegExp]> = [
      ["top", /<top\b[^>]*>([\s\S]*?)<\/top>|<top\b[^>]*\/>/],
      ["bottom", /<bottom\b[^>]*>([\s\S]*?)<\/bottom>|<bottom\b[^>]*\/>/],
      ["left", /<left\b[^>]*>([\s\S]*?)<\/left>|<left\b[^>]*\/>/],
      ["right", /<right\b[^>]*>([\s\S]*?)<\/right>|<right\b[^>]*\/>/],
    ];

    for (const [sideName, regex] of sides) {
      const sideMatch = borderXml.match(regex);
      if (!sideMatch) continue;
      const sideXml = sideMatch[0];
      const parsed = parseBorderSide(sideXml);
      if (parsed) {
        border[sideName] = parsed;
      }
    }

    borders.push(border);
  }

  return borders;
}

function parseAlignment(xfXml: string): ParsedStyle | undefined {
  const alignmentMatch = xfXml.match(/<alignment\b([^>]*)\/>/);
  if (!alignmentMatch) return undefined;

  const attrs = parseAttributes(alignmentMatch[1]);
  const alignment: ParsedStyle = {};
  if (attrs.horizontal) alignment.horizontal = attrs.horizontal;
  if (attrs.vertical) alignment.vertical = attrs.vertical;
  if (attrs.wrapText != null)
    alignment.wrapText = attrs.wrapText === "1" || attrs.wrapText === "true";
  return Object.keys(alignment).length > 0 ? alignment : undefined;
}

function parseCellXfs(xml: string): ParsedStyle[] {
  const section = getSection(xml, "cellXfs");
  if (!section) return [];

  const xfs: ParsedStyle[] = [];
  for (const match of section.matchAll(/<xf\b([^>]*)\/>|<xf\b([^>]*)>([\s\S]*?)<\/xf>/g)) {
    const attrs = parseAttributes(match[1] ?? match[2] ?? "");
    const inner = match[3] ?? "";
    const xf: ParsedStyle = {};

    const fontId = Number(attrs.fontId);
    const fillId = Number(attrs.fillId);
    const borderId = Number(attrs.borderId);
    const numFmtId = Number(attrs.numFmtId);

    if (Number.isFinite(fontId)) xf.fontId = fontId;
    if (Number.isFinite(fillId)) xf.fillId = fillId;
    if (Number.isFinite(borderId)) xf.borderId = borderId;
    if (Number.isFinite(numFmtId)) xf.numFmtId = numFmtId;

    const alignment = parseAlignment(inner);
    if (alignment) xf.alignment = alignment;

    xfs.push(xf);
  }

  return xfs;
}

function buildStyleTables(stylesXml: string): {
  fonts: ParsedStyle[];
  fills: ParsedStyle[];
  borders: ParsedStyle[];
  xfs: ParsedStyle[];
  numFmts: Map<number, string>;
} {
  return {
    fonts: parseFonts(stylesXml),
    fills: parseFills(stylesXml),
    borders: parseBorders(stylesXml),
    xfs: parseCellXfs(stylesXml),
    numFmts: parseCustomNumFmts(stylesXml),
  };
}

function toBorderStyleName(style?: string): string | undefined {
  if (!style) return undefined;
  return style;
}

function buildStyleFromIndex(
  styleIndex: number,
  tables: ReturnType<typeof buildStyleTables>,
): ParsedStyle | undefined {
  const xf = tables.xfs[styleIndex];
  if (!xf) return undefined;

  const style: ParsedStyle = {};

  if (xf.fontId != null && tables.fonts[xf.fontId]) {
    style.font = tables.fonts[xf.fontId];
  }

  if (xf.fillId != null && tables.fills[xf.fillId]) {
    style.fill = tables.fills[xf.fillId];
  }

  if (xf.borderId != null && tables.borders[xf.borderId]) {
    const border = tables.borders[xf.borderId];
    const normalizedBorder: ParsedStyle = {};
    for (const side of ["top", "bottom", "left", "right"] as const) {
      const rawSide = border[side];
      if (!rawSide) continue;
      const normalizedSide: ParsedStyle = {};
      if (rawSide.style) normalizedSide.style = toBorderStyleName(rawSide.style);
      if (rawSide.color) normalizedSide.color = rawSide.color;
      if (Object.keys(normalizedSide).length > 0) {
        normalizedBorder[side] = normalizedSide;
      }
    }
    if (Object.keys(normalizedBorder).length > 0) {
      style.border = normalizedBorder;
    }
  }

  if (xf.alignment) {
    style.alignment = xf.alignment;
  }

  if (xf.numFmtId != null) {
    const custom = tables.numFmts.get(xf.numFmtId);
    const builtin = XLSX.SSF._table?.[xf.numFmtId];
    const format = custom ?? builtin;
    if (format) {
      style.numFmt = format;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function parseSheetStyleMap(
  sheetXml: string,
  tables: ReturnType<typeof buildStyleTables>,
): Map<string, ParsedStyle> {
  const map = new Map<string, ParsedStyle>();
  for (const match of sheetXml.matchAll(/<c\b([^>]*)>/g)) {
    const attrs = parseAttributes(match[1]);
    const ref = attrs.r;
    if (!ref) continue;
    const styleIndex = Number(attrs.s);
    if (!Number.isFinite(styleIndex)) continue;
    const style = buildStyleFromIndex(styleIndex, tables);
    if (style) {
      map.set(ref, style);
    }
  }
  return map;
}

export function parseWorkbookStyleMaps(
  file: ArrayBuffer | SharedArrayBuffer,
): Map<string, ParsedStyle>[] {
  const zip = unzipSync(new Uint8Array(file));
  const stylesXml = new TextDecoder().decode(zip["xl/styles.xml"] ?? new Uint8Array());
  if (!stylesXml) return [];

  const tables = buildStyleTables(stylesXml);
  const sheetMaps: Map<string, ParsedStyle>[] = [];

  for (let index = 1; ; index += 1) {
    const entry = zip[`xl/worksheets/sheet${index}.xml`];
    if (!entry) break;
    const sheetXml = new TextDecoder().decode(entry);
    sheetMaps.push(parseSheetStyleMap(sheetXml, tables));
  }

  return sheetMaps;
}
