import XLSX from "xlsx-js-style";
import type { FortuneCell, FortuneCellValue } from "../excel/celldataUtils.js";

export interface ExcelSheetInput {
  name: string;
  celldata: FortuneCell[];
  config?: Record<string, any> | string | null;
  columnWidths?: Record<string, number> | null;
  rowHeights?: Record<string, number> | null;
  fallbackRows?: string[][];
}

interface MergeRange {
  row: [number, number];
  col: [number, number];
}

type XlsxBorderStyle =
  | "thin"
  | "medium"
  | "thick"
  | "double"
  | "hair"
  | "dashed"
  | "dotted"
  | "dashDot"
  | "mediumDashed"
  | "mediumDotted"
  | "mediumDashDot"
  | "dashDotDot"
  | "slantDashDot";

function toXlsxBorderStyle(style?: number): XlsxBorderStyle | undefined {
  switch (style) {
    case 1: return "thin";
    case 2: return "medium";
    case 3: return "thick";
    case 4: return "double";
    case 5: return "hair";
    case 6: return "dashed";
    case 7: return "dotted";
    case 8: return "dashDot";
    case 9: return "mediumDashed";
    case 10: return "mediumDotted";
    case 11: return "mediumDashDot";
    case 12: return "dashDotDot";
    case 13: return "slantDashDot";
    default: return undefined;
  }
}

function normalizeRgb(color?: string): string | undefined {
  if (!color) return undefined;
  return color.startsWith("#") ? color.slice(1) : color;
}

function parseConfig(config?: Record<string, any> | string | null): Record<string, any> {
  if (!config) return {};
  if (typeof config === "string") {
    try {
      const parsed = JSON.parse(config);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return config;
}

function toXlsxCellType(value: FortuneCellValue): XLSX.CellObject["t"] | undefined {
  if ((value as any).t) return (value as any).t;
  const raw = value.v;
  if (raw == null) return value.f ? undefined : "s";
  if (raw instanceof Date) return "d";
  switch (typeof raw) {
    case "number":
      return "n";
    case "boolean":
      return "b";
    default:
      return "s";
  }
}

function toXlsxStyle(value: FortuneCellValue): Record<string, any> | undefined {
  const style: Record<string, any> = {};

  if (value.ff || value.fs || value.fc || value.bl || value.it || value.cl || value.un) {
    style.font = {};
    if (value.ff) style.font.name = value.ff;
    if (value.fs != null) style.font.sz = value.fs;
    if (value.fc) {
      const rgb = normalizeRgb(value.fc);
      if (rgb) style.font.color = { rgb };
    }
    if (value.bl) style.font.bold = true;
    if (value.it) style.font.italic = true;
    if (value.cl) style.font.strike = true;
    if (value.un) style.font.underline = true;
  }

  if (value.bg) {
    style.fill = {
      patternType: "solid",
      fgColor: { rgb: normalizeRgb(value.bg) },
    };
  }

  if (value.ht != null || value.vt != null || value.tb != null) {
    style.alignment = {};
    if (value.ht === 0) style.alignment.horizontal = "left";
    if (value.ht === 1) style.alignment.horizontal = "center";
    if (value.ht === 2) style.alignment.horizontal = "right";
    if (value.vt === 0) style.alignment.vertical = "top";
    if (value.vt === 1) style.alignment.vertical = "center";
    if (value.vt === 2) style.alignment.vertical = "bottom";
    if (value.tb != null) style.alignment.wrapText = value.tb === "1";
  }

  if (value.ct?.fa) {
    style.numFmt = value.ct.fa;
  }

  if (value.bd) {
    const border: Record<string, any> = {};
    const sideMap: Array<["t" | "b" | "l" | "r", "top" | "bottom" | "left" | "right"]> = [
      ["t", "top"],
      ["b", "bottom"],
      ["l", "left"],
      ["r", "right"],
    ];
    for (const [fortuneKey, xlsxKey] of sideMap) {
      const side = value.bd[fortuneKey];
      if (!side) continue;
      const xlsxStyle = toXlsxBorderStyle(side.s);
      if (!xlsxStyle) continue;
      border[xlsxKey] = {
        style: xlsxStyle,
        color: side.c ? { rgb: normalizeRgb(side.c) } : undefined,
      };
    }
    if (Object.keys(border).length > 0) {
      style.border = border;
    }
  }

  return Object.keys(style).length > 0 ? style : undefined;
}

function collectMergeRanges(celldata: FortuneCell[], config?: Record<string, any> | string | null): MergeRange[] {
  const ranges = new Map<string, MergeRange>();

  for (const cell of celldata) {
    const mc = cell.v?.mc;
    if (!mc) continue;
    const row: [number, number] = [mc.r, mc.r + (mc.rs ?? 1) - 1];
    const col: [number, number] = [mc.c, mc.c + (mc.cs ?? 1) - 1];
    ranges.set(`${row[0]},${col[0]},${row[1]},${col[1]}`, { row, col });
  }

  const mergeConfig = parseConfig(config).merge;
  if (mergeConfig && typeof mergeConfig === "object") {
    for (const value of Object.values(mergeConfig as Record<string, { r: number; c: number; rs: number; cs: number }>)) {
      if (value == null) continue;
      const row: [number, number] = [value.r, value.r + (value.rs ?? 1) - 1];
      const col: [number, number] = [value.c, value.c + (value.cs ?? 1) - 1];
      ranges.set(`${row[0]},${col[0]},${row[1]},${col[1]}`, { row, col });
    }
  }

  return Array.from(ranges.values());
}

function buildWorksheetFromCelldata(
  celldata: FortuneCell[],
  config?: Record<string, any> | string | null,
  columnWidths?: Record<string, number> | null,
  rowHeights?: Record<string, number> | null,
  fallbackRows?: string[][],
): XLSX.WorkSheet {
  const ws: XLSX.WorkSheet = {};
  const parsedConfig = parseConfig(config);
  const merges = collectMergeRanges(celldata, parsedConfig);

  let maxRow = -1;
  let maxCol = -1;

  const assignCell = (row: number, col: number, value: FortuneCellValue) => {
    const ref = XLSX.utils.encode_cell({ r: row, c: col });
    const mc = value.mc;
    const isMergeAnchor = mc && mc.r === row && mc.c === col;
    const isMergedPlaceholder = mc && !isMergeAnchor;
    if (isMergedPlaceholder) {
      return;
    }

    const cell: Partial<XLSX.CellObject> = {};
    const hasFormula = typeof value.f === "string" && value.f.trim().length > 0;
    const cellType = toXlsxCellType(value);

    if (cellType) {
      cell.t = cellType;
    }
    if (value.v != null) {
      cell.v = value.v;
    } else if (!hasFormula) {
      cell.t = "s";
      cell.v = "";
    }

    if (hasFormula) cell.f = value.f;
    if (value.m != null) cell.w = String(value.m);

    const style = toXlsxStyle(value);
    if (style) {
      cell.s = style;
    }

    ws[ref] = cell as XLSX.CellObject;

    maxRow = Math.max(maxRow, row);
    maxCol = Math.max(maxCol, col);
    if (mc) {
      maxRow = Math.max(maxRow, mc.r + (mc.rs ?? 1) - 1);
      maxCol = Math.max(maxCol, mc.c + (mc.cs ?? 1) - 1);
    }
  };

  for (const cell of celldata) {
    assignCell(cell.r, cell.c, cell.v);
  }

  if (celldata.length === 0 && Array.isArray(fallbackRows)) {
    for (let r = 0; r < fallbackRows.length; r += 1) {
      const row = fallbackRows[r] ?? [];
      for (let c = 0; c < row.length; c += 1) {
        const ref = XLSX.utils.encode_cell({ r, c });
        ws[ref] = { t: "s", v: row[c] ?? "" };
        maxRow = Math.max(maxRow, r);
        maxCol = Math.max(maxCol, c);
      }
    }
  }

  if (merges.length > 0) {
    ws["!merges"] = merges.map((merge) => ({
      s: { r: merge.row[0], c: merge.col[0] },
      e: { r: merge.row[1], c: merge.col[1] },
    }));
  }

  const columnlen = parsedConfig.columnlen ?? columnWidths;
  if (columnlen && typeof columnlen === "object") {
    const maxColumnIndex = Math.max(
      maxCol,
      ...Object.keys(columnlen).map((key) => Number(key)).filter((value) => Number.isFinite(value)),
    );
    ws["!cols"] = Array.from({ length: maxColumnIndex + 1 }, (_, index) => {
      const width = (columnlen as Record<string, number>)[index];
      if (width == null) return {};
      return { wch: Math.max(1, Math.round(width / 7)) };
    });
  }

  const rowlen = parsedConfig.rowlen ?? rowHeights;
  if (rowlen && typeof rowlen === "object") {
    const maxRowIndex = Math.max(
      maxRow,
      ...Object.keys(rowlen).map((key) => Number(key)).filter((value) => Number.isFinite(value)),
    );
    ws["!rows"] = Array.from({ length: maxRowIndex + 1 }, (_, index) => {
      const height = (rowlen as Record<string, number>)[index];
      if (height == null) return {};
      return { hpt: height };
    });
  }

  const refEndRow = Math.max(maxRow, 0);
  const refEndCol = Math.max(maxCol, 0);
  ws["!ref"] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: refEndRow, c: refEndCol } });

  return ws;
}

export function celldataToExcel(sheets: ExcelSheetInput[]): ArrayBuffer {
  const wb = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const ws = buildWorksheetFromCelldata(
      sheet.celldata,
      sheet.config,
      sheet.columnWidths,
      sheet.rowHeights,
      sheet.fallbackRows,
    );
    XLSX.utils.book_append_sheet(wb, ws, sheet.name);
  }

  return XLSX.write(wb, { type: "array", bookType: "xlsx" });
}
