import type { FortuneCell } from "./celldataUtils.js";

export type { FortuneCell };

export type FilterSelection = {
  row: [number, number];
  column: [number, number];
};

/**
 * 所有 sheet 级配置属性，均为 optional。
 * 与 FortuneSheet 的 sheet 顶层属性一一对应。
 */
export interface SheetConfig {
  config?: any;
  color?: string;
  status?: string;
  row?: number;
  column?: number;
  luckysheet_select_save?: any[];
  scrollLeft?: number;
  scrollTop?: number;
  frozen?: any;
  freezen?: any;
  filter?: any;
  filter_select?: FilterSelection;
  zoomRatio?: number;
  showGridLines?: boolean | number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  images?: any[];
  dataVerification?: any;
  hyperlink?: Record<string, any>;
  calcChain?: any[];
  luckysheet_conditionformat_save?: any[];
  luckysheet_alternateformat_save?: any[];
  chart?: any[];
  isPivotTable?: boolean;
  pivotTable?: any;
  hide?: number;
}

/** FortuneSheetData 接口——传给 FortuneSheet Workbook 的 sheet 数据 */
export interface FortuneSheetData {
  id: string;
  name: string;
  celldata: FortuneCell[];
  columnWidths: Record<string, number>;
  merges: { row: [number, number]; col: [number, number] }[];
  config?: any;
  color?: string;
  status?: string;
  row?: number;
  column?: number;
  luckysheet_select_save?: any[];
  scrollLeft?: number;
  scrollTop?: number;
  frozen?: any;
  freezen?: any;
  filter?: any;
  filter_select?: FilterSelection;
  zoomRatio?: number;
  showGridLines?: boolean | number;
  defaultRowHeight?: number;
  defaultColWidth?: number;
  images?: any[];
  dataVerification?: any;
  hyperlink?: Record<string, any>;
  calcChain?: any[];
  luckysheet_conditionformat_save?: any[];
  luckysheet_alternateformat_save?: any[];
  chart?: any[];
  isPivotTable?: boolean;
  pivotTable?: any;
  hide?: number;
}

const CONFIG_KEYS: (keyof SheetConfig)[] = [
  "config",
  "color",
  "status",
  "row",
  "column",
  "luckysheet_select_save",
  "scrollLeft",
  "scrollTop",
  "frozen",
  "freezen",
  "filter",
  "filter_select",
  "zoomRatio",
  "showGridLines",
  "defaultRowHeight",
  "defaultColWidth",
  "images",
  "dataVerification",
  "hyperlink",
  "calcChain",
  "luckysheet_conditionformat_save",
  "luckysheet_alternateformat_save",
  "chart",
  "isPivotTable",
  "pivotTable",
  "hide",
];

/**
 * 从 FortuneSheet 的 sheet 数据中提取非空的 sheet 级配置。
 * 只返回有值的属性，避免传输和存储大量 null。
 */
export function extractSheetConfig(sheet: any): SheetConfig {
  const out: SheetConfig = {};
  for (const key of CONFIG_KEYS) {
    if (sheet[key] != null) {
      (out as any)[key] = sheet[key];
    }
  }
  return out;
}

/**
 * 将 SheetConfig 的所有属性应用到 FortuneSheetData 对象上。
 */
export function restoreSheetConfig(target: FortuneSheetData, cfg: SheetConfig): void {
  for (const key of CONFIG_KEYS) {
    if (cfg[key] !== undefined) {
      (target as any)[key] = cfg[key];
    }
  }
}
