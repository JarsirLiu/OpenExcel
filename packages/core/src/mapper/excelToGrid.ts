import * as XLSX from "xlsx";
import type { Template, MergeDef } from "../types/index.js";
import type { FortuneCell, FortuneCellValue } from "./celldataUtils.js";

export interface SheetParseResult {
  celldata: FortuneCell[];
  merges: MergeDef[];
  config: Record<string, any>;
}

function getWorkbook(file: ArrayBuffer | XLSX.WorkBook): XLSX.WorkBook {
  if (file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
    return XLSX.read(file, { type: "array", cellStyles: true, cellFormula: true, cellNF: true });
  }
  return file;
}

function extractMerges(ws: XLSX.WorkSheet): MergeDef[] {
  const raw: XLSX.Range[] = (ws as any)["!merges"] ?? [];
  return raw.map((m) => ({
    row: [m.s.r, m.e.r] as [number, number],
    col: [m.s.c, m.e.c] as [number, number],
  }));
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
      range: { row_focus: freeze.yflaten ?? freeze.y ?? 0, column_focus: freeze.xflaten ?? freeze.x ?? 0 },
    };
  }

  return config;
}

function extractCellStyle(cell: XLSX.CellObject): FortuneCellValue {
  const v: FortuneCellValue = { v: null!, m: "" };

  if (cell.v != null) {
    v.v = cell.v;
  }
  v.m = cell.h ?? (cell.v != null ? String(cell.v) : "");

  if (cell.f) v.f = cell.f;

  if (cell.s?.numFmt) {
    v.ct = { fa: cell.s.numFmt };
  }

  const font = cell.s?.font;
  if (font) {
    if (font.b) v.bl = 1;
    if (font.i) v.it = 1;
    if (font.s) v.cl = 1;
    if (font.u) v.un = 1;
    if (font.sz) v.fs = font.sz;
    if (font.name) v.ff = font.name;
    if (font.color?.rgb) v.fc = "#" + font.color.rgb;
  }

  const fill = cell.s?.fill;
  if (fill?.fgColor?.rgb) {
    v.bg = "#" + fill.fgColor.rgb;
  }

  const align = cell.s?.alignment;
  if (align) {
    switch (align.horizontal) {
      case "left": v.ht = 0; break;
      case "center": v.ht = 1; break;
      case "right": v.ht = 2; break;
    }
    switch (align.vertical) {
      case "top": v.vt = 0; break;
      case "center": v.vt = 1; break;
      case "bottom": v.vt = 2; break;
    }
    if (align.wrapText) v.tb = "1";
  }

  return v;
}

/**
 * 将 SheetJS worksheet 完整转换为 celldata 格式，保留所有 cell 属性。
 */
function worksheetToCelldata(ws: XLSX.WorkSheet, merges: MergeDef[]): FortuneCell[] {
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

      const v = extractCellStyle(cell);

      const mc = mergeMap.get(`${row},${col}`);
      if (mc) v.mc = mc;

      const hasValue = cell.v != null;
      const hasStyle = cell.s && (
        cell.s.font?.b || cell.s.font?.i || cell.s.font?.s || cell.s.font?.u ||
        cell.s.font?.sz || cell.s.font?.name || cell.s.font?.color?.rgb ||
        cell.s.fill?.fgColor?.rgb ||
        cell.s.alignment?.horizontal || cell.s.alignment?.vertical || cell.s.alignment?.wrapText ||
        cell.s.numFmt || cell.f || mc
      );

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
  file: ArrayBuffer | XLSX.WorkBook,
  sheets: string[] | Template,
): SheetParseResult[] {
  const wb = getWorkbook(file);
  const sheetNames = Array.isArray(sheets) ? sheets : sheets.sheets.map((s) => s.name);
  const result: SheetParseResult[] = [];

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) {
      result.push({ celldata: [], merges: [], config: {} });
      continue;
    }
    const merges = extractMerges(ws);
    const celldata = worksheetToCelldata(ws, merges);
    const config = extractSheetConfig(ws);
    result.push({ celldata, merges, config });
  }

  return result;
}