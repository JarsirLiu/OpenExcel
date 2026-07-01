import type { FortuneCell } from "./celldataUtils.js";

export type { FortuneCell };

/**
 * 所有 sheet 级配置属性，均为 optional。
 * 与 FortuneSheet 的 sheet 顶层属性一一对应。
 */
export interface SheetConfig {
  config?: any;
  frozen?: any;
  filter?: any;
  filter_select?: any;
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
}

/** FortuneSheetData 接口——传给 FortuneSheet Workbook 的 sheet 数据 */
export interface FortuneSheetData {
  id: string;
  name: string;
  celldata: FortuneCell[];
  columnWidths: Record<string, number>;
  merges: { row: [number, number]; col: [number, number] }[];
  config?: any;
  frozen?: any;
  filter?: any;
  filter_select?: any;
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
}

const CONFIG_KEYS: (keyof SheetConfig)[] = [
  "config",
  "frozen",
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
