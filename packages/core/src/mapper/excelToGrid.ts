import * as XLSX from "xlsx";
import type { Template, MergeDef } from "../types/index.js";

/**
 * 上传 Excel 的解析结果：每个 sheet 的数据 + 合并单元格范围 + sheet 级配置
 */
export interface SheetParseResult {
  data: string[][];
  merges: MergeDef[];
  /** 该 sheet 的 config 对象（列宽、行高、冻结等），将存入 DB config 字段 */
  config?: any;
}

function getWorkbook(file: ArrayBuffer | XLSX.WorkBook): XLSX.WorkBook {
  if (file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
    return XLSX.read(file, { type: "array" });
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
 * 上传的 Excel → 按 Sheet 名匹配，提取每 Sheet 的二维数据 + 合并范围 + sheet 配置。
 * 返回每 Sheet 从第 1 行（跳过表头）开始的用户数据。
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
      result.push({ data: [], merges: [], config: {} });
      continue;
    }
    const allRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const merges = extractMerges(ws);
    const config = extractSheetConfig(ws);
    result.push({ data: allRows.slice(1), merges, config });
  }

  return result;
}