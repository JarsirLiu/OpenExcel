import type { Worksheet } from "exceljs";
import { fortuneFilterSelectionToExcelRef } from "../excel/excelFilter.js";

export function applyFortuneAutoFilter(worksheet: Worksheet, config: Record<string, any>): void {
  const ref = fortuneFilterSelectionToExcelRef(config.filter_select);
  if (ref) worksheet.autoFilter = ref;
}
