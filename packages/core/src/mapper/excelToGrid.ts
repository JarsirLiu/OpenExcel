import * as XLSX from "xlsx";
import type { Template } from "../types/index.js";

function getWorkbook(file: ArrayBuffer | XLSX.WorkBook): XLSX.WorkBook {
  if (file instanceof ArrayBuffer || file instanceof SharedArrayBuffer) {
    return XLSX.read(file, { type: "array" });
  }
  return file;
}

/**
 * 上传的 Excel → 按 Sheet 名匹配，提取每 Sheet 二维数据。
 * 返回每 Sheet 从第 1 行（跳过表头）开始的用户数据。
 */
export function excelToGrid(
  file: ArrayBuffer | XLSX.WorkBook,
  sheets: string[] | Template,
): string[][][] {
  const wb = getWorkbook(file);
  const sheetNames = Array.isArray(sheets) ? sheets : sheets.sheets.map((s) => s.name);
  const result: string[][][] = [];

  for (const name of sheetNames) {
    const ws = wb.Sheets[name];
    if (!ws) {
      result.push([]);
      continue;
    }
    const allRows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });
    result.push(allRows.slice(1));
  }

  return result;
}
