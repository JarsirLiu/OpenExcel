import XLSX from "xlsx-js-style";
import type { MergeDef, Template } from "../types/index.js";
import type { FortuneCell, FortuneCellValue } from "./celldataUtils.js";
import { parseWorkbookStyleMaps } from "./xlsxStyleParser.js";

export interface SheetParseResult {
  celldata: FortuneCell[];
  merges: MergeDef[];
  config: Record<string, any>;
}

function getWorkbook(file: ArrayBuffer | SharedArrayBuffer): XLSX.WorkBook {
  return XLSX.read(file, { type: "array", cellStyles: true, cellFormula: true, cellNF: true });
}

function extractMerges(ws: XLSX.WorkSheet): MergeDef[] {
  const raw: XLSX.Range[] = (ws as any)["!merges"] ?? [];
  return raw.map((m) => ({
    row: [m.s.r, m.e.r] as [number, number],
    col: [m.s.c, m.e.c] as [number, number],
  }));
}

function normalizeHexColor(color: string): string {
  const hex = color.startsWith("#") ? color.slice(1) : color;
  if (hex.length === 8 && hex.startsWith("FF")) {
    return `#${hex.slice(2)}`;
  }
  return `#${hex}`;
}

function extractSheetConfig(ws: XLSX.WorkSheet): Record<string, any> {
  const config: Record<string, any> = {};

  const cols: { wch?: number; hpx?: number }[] = (ws as any)["!cols"];
  if (cols && cols.length > 0) {
    const columnlen: Record<string, number> = {};
    cols.forEach((c, i) => {
      // wch 是字符宽度（Excel 单位），* 7 近似转换为像素
      if (c.wch != null) columnlen[i] = c.wch * 7;
    });
    if (Object.keys(columnlen).length > 0) config.columnlen = columnlen;
  }

  const rows: { hpx?: number; hpt?: number }[] = (ws as any)["!rows"];
  if (rows && rows.length > 0) {
    const rowlen: Record<string, number> = {};
    rows.forEach((r, i) => {
      const h = r.hpt ?? r.hpx;
      if (h != null) rowlen[i] = h;
    });
    if (Object.keys(rowlen).length > 0) config.rowlen = rowlen;
  }

  const freeze = (ws as any)["!freeze"];
  if (freeze) {
    config.frozen = {
      type: "rangeRow",
      range: {
        row_focus: freeze.yflaten ?? freeze.y ?? 0,
        column_focus: freeze.xflaten ?? freeze.x ?? 0,
      },
    };
  }

  return config;
}

export function extractCellStyle(cell: XLSX.CellObject): FortuneCellValue {
  const v: FortuneCellValue = { v: null!, m: "" };

  if (cell.v != null) {
    v.v = cell.v;
  }
  v.m = cell.w ?? (cell.v != null ? String(cell.v) : "");

  if (cell.f) v.f = cell.f;

  if (cell.s?.numFmt) {
    v.ct = { fa: cell.s.numFmt };
  }

  const font = cell.s?.font;
  if (font) {
    if (font.b || (font as any).bold) v.bl = 1;
    if (font.i || (font as any).italic) v.it = 1;
    if (font.s || (font as any).strike) v.cl = 1;
    if (font.u || (font as any).underline) v.un = 1;
    if (font.sz) v.fs = font.sz;
    if (font.name) v.ff = font.name;
    if (font.color?.rgb) v.fc = normalizeHexColor(font.color.rgb);
  }

  const fill = cell.s?.fill;
  if (fill?.fgColor?.rgb) {
    v.bg = normalizeHexColor(fill.fgColor.rgb);
  }

  const align = cell.s?.alignment;
  if (align) {
    switch (align.horizontal) {
      case "left":
        v.ht = 0;
        break;
      case "center":
        v.ht = 1;
        break;
      case "right":
        v.ht = 2;
        break;
      case "centerContinuous":
        v.ht = 1;
        break;
    }
    switch (align.vertical) {
      case "top":
        v.vt = 0;
        break;
      case "center":
        v.vt = 1;
        break;
      case "bottom":
        v.vt = 2;
        break;
    }
    if (align.wrapText) v.tb = "1";
  }

  const border = cell.s?.border;
  if (border) {
    const bd: FortuneCellValue["bd"] = {};
    const mapSide = (side: "top" | "bottom" | "left" | "right", key: "t" | "b" | "l" | "r") => {
      const b = border[side];
      if (!b) return;
      const s = BORDER_STYLE_MAP[b.style ?? "none"];
      if (s === 0) return;
      const c = b.color?.rgb ? normalizeHexColor(b.color.rgb) : undefined;
      (bd as any)[key] = { s, c };
    };
    mapSide("top", "t");
    mapSide("bottom", "b");
    mapSide("left", "l");
    mapSide("right", "r");
    if (Object.keys(bd).length > 0) {
      v.bd = bd;
    }
  }

  return v;
}

/** SheetJS 边框样式 → FortuneSheet 数值码 */
const BORDER_STYLE_MAP: Record<string, number> = {
  none: 0,
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
  dashDotDot: 12,
  slantDashDot: 13,
};

/**
 * 将 SheetJS worksheet 完整转换为 celldata 格式，保留所有 cell 属性。
 */
function worksheetToCelldata(
  ws: XLSX.WorkSheet,
  merges: MergeDef[],
  styleLookup?: Map<string, Record<string, any>>,
): FortuneCell[] {
  const celldata: FortuneCell[] = [];
  const ref = (ws as any)["!ref"];
  if (!ref) return celldata;

  const range = XLSX.utils.decode_range(ref);

  const mergeMap = new Map<string, { r: number; c: number; rs: number; cs: number }>();
  for (const m of merges) {
    const rs = m.row[1] - m.row[0] + 1;
    const cs = m.col[1] - m.col[0] + 1;
    mergeMap.set(`${m.row[0]},${m.col[0]}`, { r: m.row[0], c: m.col[0], rs, cs });
  }

  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellRef = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = ws[cellRef];
      if (!cell) continue;

      const parsedStyle = styleLookup?.get(cellRef);
      const v = extractCellStyle(parsedStyle ? { ...cell, s: parsedStyle } : cell);

      const mc = mergeMap.get(`${row},${col}`);
      if (mc) v.mc = mc;

      const hasValue = cell.v != null;
      const hasStyle =
        cell.s &&
        (cell.s.font?.b ||
          cell.s.font?.i ||
          cell.s.font?.s ||
          cell.s.font?.u ||
          cell.s.font?.sz ||
          cell.s.font?.name ||
          cell.s.font?.color?.rgb ||
          cell.s.fill?.fgColor?.rgb ||
          cell.s.alignment?.horizontal ||
          cell.s.alignment?.vertical ||
          cell.s.alignment?.wrapText ||
          cell.s.numFmt ||
          cell.f ||
          mc);

      if (hasValue || hasStyle) {
        celldata.push({ r: row, c: col, v });
      }
    }
  }

  return celldata;
}

/**
 * 上传的 Excel → 按 Sheet 名匹配，完整解析每 Sheet 的 celldata + 合并范围 + sheet 配置。
 * 保留所有行（包括标题行），保留所有 cell 样式。
 */
export function excelToGrid(
  file: ArrayBuffer | SharedArrayBuffer,
  sheets: string[] | Template,
): SheetParseResult[] {
  const wb = getWorkbook(file);
  const sheetNames = Array.isArray(sheets) ? sheets : sheets.sheets.map((s) => s.name);
  const result: SheetParseResult[] = [];
  const styleMapBySheetName = new Map<string, Map<string, Record<string, any>>>();
  if (file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
    const parsedStyleMaps = parseWorkbookStyleMaps(file);
    wb.SheetNames.forEach((sheetName, index) => {
      const styleMap = parsedStyleMaps[index];
      if (styleMap) {
        styleMapBySheetName.set(sheetName, styleMap);
      }
    });
  }

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) {
      result.push({ celldata: [], merges: [], config: {} });
      continue;
    }
    const merges = extractMerges(ws);
    const celldata = worksheetToCelldata(ws, merges, styleMapBySheetName.get(name));
    const config = extractSheetConfig(ws);
    result.push({ celldata, merges, config });
  }

  return result;
}
