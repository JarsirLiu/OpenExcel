/** 单列定义 */
export interface ColumnDef {
  label: string;
  width?: number;
}

/** 合并单元格 */
export interface MergeDef {
  row: [number, number];
  col: [number, number];
}

/** 单个 Sheet 定义 */
export interface SheetDef {
  name: string;
  columns: ColumnDef[];
  rows: string[][];
  merges?: MergeDef[];
}

/** 单个 Workbook（顶部一个 tab，底部多个 sheet） */
export interface WorkbookDef {
  name: string;
  sheets: SheetDef[];
}

/** 初始化配置 */
export interface InitConfig {
  workbooks: WorkbookDef[];
}

/** 模板定义（用于生成 Excel 工具函数） */
export interface Template {
  id: string;
  name: string;
  groups: any[];
  sheets: SheetDef[];
}
