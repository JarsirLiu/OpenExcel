import ExcelJS from "exceljs";
import type { FortuneCell } from "../excel/celldataUtils.js";
import { writeSheetToWorksheet } from "./excelJsWorksheet.js";

export interface ExcelSheetInput {
  name: string;
  celldata: FortuneCell[];
  config?: Record<string, any> | string | null;
  columnWidths?: Record<string, number> | null;
  rowHeights?: Record<string, number> | null;
  fallbackRows?: string[][];
}

export async function celldataToExcel(sheets: ExcelSheetInput[]): Promise<ArrayBuffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(0);
  workbook.modified = new Date(0);

  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    writeSheetToWorksheet(worksheet, sheet);
  }

  const buffer = await workbook.xlsx.writeBuffer({
    useStyles: true,
    useSharedStrings: true,
  });
  return buffer as ArrayBuffer;
}
