import { gridToCelldata, isCelldata } from "@openexcel/core";
import type { FortuneCell } from "@openexcel/core";

export type { FortuneCell };

/**
 * 传给 FortuneSheet 的 sheet 数据。
 * 扩展支持 config／frozen／filter 等 sheet 级配置。
 */
export interface FortuneSheetData {
  id: string;
  name: string;
  celldata: FortuneCell[];
  columnWidths: Record<string, number>;
  merges: { row: [number, number]; col: [number, number] }[];
  // 以下可选属性从 DB config 还原
  config?: any;
  frozen?: any;
  filter?: Record<string, any>;
  filter_select?: { row: number[]; column: number[] };
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

/**
 * 从 celldata 的 mc 属性提取合并范围。
 */
function extractMergesFromCelldata(celldata: FortuneCell[]): { row: [number, number]; col: [number, number] }[] {
  const seen = new Set<string>();
  const merges: { row: [number, number]; col: [number, number] }[] = [];
  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (!mc) continue;
    const key = `${mc.r}_${mc.c}_${mc.rs}_${mc.cs}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merges.push({
      row: [mc.r, mc.r + (mc.rs ?? 1) - 1] as [number, number],
      col: [mc.c, mc.c + (mc.cs ?? 1) - 1] as [number, number],
    });
  }
  return merges;
}

export function toFortuneSheetData(
  sheet: {
    id: number;
    name: string;
    columns: { label: string; width?: number }[];
    merges: { row: [number, number]; col: [number, number] }[];
    rows: string[][];
    uploadedData: any[] | null;
    config: any | null;
  },
): FortuneSheetData {
  let celldata: FortuneCell[];
  let merges: { row: [number, number]; col: [number, number] }[];

  if (sheet.uploadedData && isCelldata(sheet.uploadedData)) {
    celldata = sheet.uploadedData as FortuneCell[];
    merges = extractMergesFromCelldata(celldata);
    if (merges.length === 0) {
      merges = (sheet.merges || []).map((m) => ({
        row: [m.row[0] + 1, m.row[1] + 1],
        col: [m.col[0], m.col[1]],
      }));
    }
  } else if (sheet.uploadedData) {
    celldata = gridToCelldata(sheet.uploadedData, sheet.columns.map((c) => c.label));
    merges = (sheet.merges || []).map((m) => ({
      row: [m.row[0] + 1, m.row[1] + 1],
      col: [m.col[0], m.col[1]],
    }));
  } else {
    celldata = gridToCelldata(sheet.rows, sheet.columns.map((c) => c.label));
    merges = (sheet.merges || []).map((m) => ({
      row: [m.row[0] + 1, m.row[1] + 1],
      col: [m.col[0], m.col[1]],
    }));
  }

  const result: FortuneSheetData = {
    id: String(sheet.id),
    name: sheet.name,
    celldata,
    columnWidths: sheet.columns.reduce((acc: Record<string, number>, col, i) => {
      if (col.width) acc[i] = col.width;
      return acc;
    }, {}),
    merges,
  };

  // 还原之前保存的 sheet 级配置
  if (sheet.config && typeof sheet.config === "object") {
    const cfg = sheet.config;
    if (cfg.config != null) result.config = cfg.config;
    if (cfg.frozen != null) result.frozen = cfg.frozen;
    if (cfg.filter != null) result.filter = cfg.filter;
    if (cfg.filter_select != null) result.filter_select = cfg.filter_select;
    if (cfg.zoomRatio != null) result.zoomRatio = cfg.zoomRatio;
    if (cfg.showGridLines != null) result.showGridLines = cfg.showGridLines;
    if (cfg.defaultRowHeight != null) result.defaultRowHeight = cfg.defaultRowHeight;
    if (cfg.defaultColWidth != null) result.defaultColWidth = cfg.defaultColWidth;
    if (cfg.images != null) result.images = cfg.images;
    if (cfg.dataVerification != null) result.dataVerification = cfg.dataVerification;
    if (cfg.hyperlink != null) result.hyperlink = cfg.hyperlink;
    if (cfg.calcChain != null) result.calcChain = cfg.calcChain;
    if (cfg.luckysheet_conditionformat_save != null) result.luckysheet_conditionformat_save = cfg.luckysheet_conditionformat_save;
    if (cfg.luckysheet_alternateformat_save != null) result.luckysheet_alternateformat_save = cfg.luckysheet_alternateformat_save;
  }

  return result;
}