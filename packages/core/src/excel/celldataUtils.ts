export interface FortuneCell {
  r: number;
  c: number;
  v: FortuneCellValue;
}

export interface FortuneCellValue {
  v: any;
  m: string;
  f?: string;
  mc?: { r: number; c: number; rs?: number; cs?: number };
  bg?: string;
  fc?: string;
  fs?: number;
  ff?: string;
  bl?: number;
  it?: number;
  cl?: number;
  un?: number;
  ht?: number;
  vt?: number;
  tb?: string;
  tr?: number;
  rt?: number;
  qp?: number;
  va?: number;
  ct?: { fa?: string; t?: string; s?: unknown[] };
  bd?: {
    t?: { s: number; c?: string };
    b?: { s: number; c?: string };
    l?: { s: number; c?: string };
    r?: { s: number; c?: string };
  };
}

export const DEFAULT_FORTUNE_FONT_COLOR = "#000000";

const INLINE_STYLE_KEYS = ["ff", "fc", "fs", "bl", "it", "cl", "un", "va"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSingleInlineString(value: FortuneCellValue): FortuneCellValue {
  const format = value.ct;
  if (format?.t !== "inlineStr" || !Array.isArray(format.s) || format.s.length !== 1) {
    return value;
  }
  const run = format.s[0];
  if (!isRecord(run) || typeof run.v !== "string") return value;

  const normalized: FortuneCellValue = {
    ...value,
    v: run.v,
    m: value.m || run.v,
    ct: { fa: format.fa, t: "s" },
  };
  for (const key of INLINE_STYLE_KEYS) {
    if (normalized[key] == null && run[key] != null) {
      (normalized as unknown as Record<string, unknown>)[key] = run[key];
    }
  }
  return normalized;
}

/**
 * Normalize external Excel cell data into a stable FortuneSheet representation.
 * Excel commonly omits default black from styles, and single-run inline strings
 * are rendered inconsistently by FortuneSheet's canvas implementation.
 */
export function normalizeFortuneCellData(celldata: FortuneCell[]): FortuneCell[] {
  let changed = false;
  const normalized = celldata.map((cell) => {
    if (
      !cell ||
      typeof cell !== "object" ||
      !cell.v ||
      typeof cell.v !== "object" ||
      Array.isArray(cell.v)
    ) {
      return cell;
    }
    let value = cell.v;
    if (value.fc == null) {
      value = { ...value, fc: DEFAULT_FORTUNE_FONT_COLOR };
    }
    const inlineNormalized = normalizeSingleInlineString(value);
    if (inlineNormalized !== cell.v) {
      value = inlineNormalized;
    }
    if (value !== cell.v) {
      changed = true;
      return { ...cell, v: value };
    }
    return cell;
  });

  return changed ? normalized : celldata;
}

export function extractMergesFromCelldata(
  celldata: FortuneCell[],
): { row: [number, number]; col: [number, number] }[] {
  const seen = new Set<string>();
  const merges: { row: [number, number]; col: [number, number] }[] = [];

  for (const cell of celldata) {
    const merge = cell.v?.mc;
    if (!merge || merge.r !== cell.r || merge.c !== cell.c) continue;

    const rowEnd = merge.r + (merge.rs ?? 1) - 1;
    const colEnd = merge.c + (merge.cs ?? 1) - 1;
    const key = `${merge.r}_${merge.c}_${rowEnd}_${colEnd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merges.push({
      row: [merge.r, rowEnd],
      col: [merge.c, colEnd],
    });
  }

  return merges;
}

export function isCelldata(data: any): data is FortuneCell[] {
  return (
    Array.isArray(data) &&
    data.length > 0 &&
    typeof data[0] === "object" &&
    "r" in data[0] &&
    "c" in data[0] &&
    "v" in data[0]
  );
}

export function celldataToGrid(celldata: FortuneCell[], columnCount: number): string[][] {
  const maxRow = Math.max(...celldata.map((c) => c.r), 0);
  const grid: string[][] = Array.from({ length: maxRow + 1 }, () => Array(columnCount).fill(""));
  for (const cell of celldata) {
    grid[cell.r][cell.c] = String(cell.v?.v ?? "");
  }
  return grid;
}

export function gridToCelldata(grid: string[][], headerRow?: string[]): FortuneCell[] {
  const cells: FortuneCell[] = [];
  if (headerRow) {
    headerRow.forEach((label, ci) => {
      cells.push({ r: 0, c: ci, v: { v: label, m: label } });
    });
  }
  const rowOffset = headerRow ? 1 : 0;
  grid.forEach((row, ri) => {
    const r = ri + rowOffset;
    row.forEach((val, ci) => {
      cells.push({ r, c: ci, v: { v: val, m: String(val) } });
    });
  });
  return cells;
}

/**
 * 将 FortuneSheet 内部的 2D CellMatrix（(Cell|null)[][]）转换回
 * celldata 稀疏格式（{r, c, v}[]），用于持久化。
 */
export function matrixToCelldata(data: (Record<string, any> | null)[][]): FortuneCell[] {
  const celldata: FortuneCell[] = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell != null) {
        celldata.push({ r, c, v: cell as FortuneCellValue });
      }
    }
  }
  return celldata;
}
