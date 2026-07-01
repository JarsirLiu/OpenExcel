export interface FortuneCell {
  r: number;
  c: number;
  v: {
    v: any;
    m: string;
    mc?: { r: number; c: number; rs?: number; cs?: number };
    bg?: string;
    fc?: string;
    fs?: number;
    bl?: number;
    it?: number;
    ht?: number;
    vt?: number;
    tb?: string;
    ct?: { fa?: string; t?: string };
  };
}

export function isCelldata(data: any): boolean {
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
  const grid: string[][] = Array.from({ length: maxRow + 1 }, () =>
    Array(columnCount).fill(""),
  );
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
export function matrixToCelldata(data: (Record<string, any> | null)[][]): any[] {
  const celldata: any[] = [];
  for (let r = 0; r < data.length; r++) {
    const row = data[r];
    if (!row) continue;
    for (let c = 0; c < row.length; c++) {
      const cell = row[c];
      if (cell != null) {
        celldata.push({ r, c, v: cell });
      }
    }
  }
  return celldata;
}