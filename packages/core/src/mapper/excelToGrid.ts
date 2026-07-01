import * as XLSX from "xlsx";
import type { Template, MergeDef } from "../types/index.js";

/**
 * 上传 Excel 的解析结果：每个 sheet 的数据 + 合并单元格范围
 */
export interface SheetParseResult {
  data: string[][];
  merges: MergeDef[];
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

/**
 * 上传的 Excel → 按 Sheet 名匹配，提取每 Sheet 的二维数据 + 合并范围。
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
      result.push({ data: [], merges: [] });
      continue;
    }
    const allRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    const merges = extractMerges(ws);
    result.push({ data: allRows.slice(1), merges });
  }

  return result;
}