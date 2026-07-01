import * as XLSX from "xlsx";
import type { Template } from "../types/index.js";

/**
 * 模板定义 → .xlsx 文件下载
 */
export function templateToExcel(template: Template): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const sheet of template.sheets) {
    const headerRow = sheet.columns.map((c) => c.label);
    const rows = [headerRow, ...sheet.rows];
    const ws = XLSX.utils.aoa_to_sheet(rows);

    // 列宽
    ws["!cols"] = sheet.columns.map((c) => ({ wch: c.width ? Math.round(c.width / 7) : 20 }));

    // 合并单元格（merges 是数据行索引，+1 因为第 0 行是表头）
    if (sheet.merges && sheet.merges.length > 0) {
      ws["!merges"] = sheet.merges.map((m) => ({
        s: { r: m.row[0] + 1, c: m.col[0] },
        e: { r: m.row[1] + 1, c: m.col[1] },
      }));
    }

    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
