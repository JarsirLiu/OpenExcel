import type { FortuneCell } from "../excel/celldataUtils.js";

export interface ExcelSheetInput {
  id: string;
  name: string;
  celldata: FortuneCell[];
  config?: Record<string, any> | string | null;
  columnWidths?: Record<string, number> | null;
  rowHeights?: Record<string, number> | null;
  fallbackRows?: string[][];
}
