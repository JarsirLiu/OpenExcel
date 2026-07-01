import * as XLSX from "xlsx";
import type { Template, MergeDef } from "../types/index.js";

/**
 * 上传 Excel 的解析结果：每个 sheet 的 celldata + 合并范围 + sheet 级配置
 */
export interface SheetParseResult {
  celldata: any[];
  merges: MergeDef[];
  config?: any;
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

function extractSheetConfig(ws: XLSX.WorkSheet): any {
  const config: any = {};

  // 列宽
  const cols: { wch?: number; hpx?: number }[] = (ws as any)["!cols"];
  if (cols && cols.length > 0) {
    const columnlen: Record<string, number> = {};
    cols.forEach((c, i) => {
      if (c.wch != null) columnlen[i] = c.wch * 7;
    });
    if (Object.keys(columnlen).length > 0) config.columnlen = columnlen;
  }

  // 行高
  const rows: { hpx?: number; hpt?: number }[] = (ws as any)["!rows"];
  if (rows && rows.length > 0) {
    const rowlen: Record<string, number> = {};
    rows.forEach((r, i) => {
      const h = r.hpt ?? r.hpx;
      if (h != null) rowlen[i] = h * (r.hpt ? 1 : 1);
    });
    if (Object.keys(rowlen).length > 0) config.rowlen = rowlen;
  }

  // 冻结窗格
  const freeze = (ws as any)["!freeze"];
  if (freeze) {
    config.frozen = {
      type: "rangeRow",
      range: { row_focus: freeze.yflaten ?? freeze.y ?? 0, column_focus: freeze.xflaten ?? freeze.x ?? 0 },
    };
  }

  return config;
}

/**
 * 从 SheetJS 的 cell 样式对象中提取 FortuneSheet 可识别的属性。
 */
function extractCellStyle(cell: XLSX.CellObject): any {
  const v: any = {};

  // 值
  if (cell.v != null) {
    v.v = cell.v;
  }
  // 显示文本（格式化后的值）
  v.m = cell.h ?? (cell.v != null ? String(cell.v) : "");

  // 公式
  if (cell.f) v.f = cell.f;

  // 数字格式
  if (cell.s?.numFmt) {
    v.ct = { fa: cell.s.numFmt };
  }

  // 字体
  const font = cell.s?.font;
  if (font) {
    if (font.b) v.bl = 1;
    if (font.i) v.it = 1;
    if (font.s) v.cl = 1; // strikethrough
    if (font.u) v.un = 1;
    if (font.sz) v.fs = font.sz;
    if (font.name) v.ff = font.name;
    if (font.color?.rgb) v.fc = "#" + font.color.rgb;
  }

  // 背景色
  const fill = cell.s?.fill;
  if (fill?.fgColor?.rgb) {
    v.bg = "#" + fill.fgColor.rgb;
  }

  // 对齐
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
function worksheetToCelldata(ws: XLSX.WorkSheet, merges: MergeDef[]): any[] {
  const celldata: any[] = [];
  const ref = (ws as any)["!ref"];
  if (!ref) return celldata;

  const range = XLSX.utils.decode_range(ref);

  // 构建合并单元格索引：key = "r,c" -> { r, c, rs, cs }
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

      // 合并单元格信息
      const mc = mergeMap.get(`${row},${col}`);
      if (mc) v.mc = mc;

      // 只保存有内容或有样式的 cell
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