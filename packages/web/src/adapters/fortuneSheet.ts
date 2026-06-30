export interface FortuneCell {
  r: number;
  c: number;
  v: { v: any; m: string };
}

export interface FortuneSheetData {
  id: string;
  name: string;
  celldata: FortuneCell[];
  columnWidths: Record<string, number>;
  merges: { row: [number, number]; col: [number, number] }[];
}

export function buildCelldata(
  columns: { label: string; width?: number }[],
  templateRows: string[][],
  uploadedData?: string[][] | null,
): FortuneCell[] {
  const cells: FortuneCell[] = [];

  columns.forEach((col, ci) => {
    cells.push({ r: 0, c: ci, v: { v: col.label, m: col.label } });
  });

  const rows = uploadedData ?? templateRows;

  rows.forEach((row, ri) => {
    const r = ri + 1;
    columns.forEach((_col, ci) => {
      const val = row[ci] ?? "";
      cells.push({ r, c: ci, v: { v: val, m: String(val) } });
    });
  });

  return cells;
}

export function celldataTo2DArray(
  celldata: { r: number; c: number; v: { v: any } }[],
  columns: number,
): any[][] {
  const maxRow = Math.max(...celldata.map((c) => c.r), 0);
  const array: any[][] = Array.from({ length: maxRow + 1 }, () =>
    Array(columns).fill("")
  );
  celldata.forEach((cell) => {
    if (cell.r > 0) {
      array[cell.r][cell.c] = cell.v?.v ?? "";
    }
  });
  return array;
}

export function toFortuneSheetData(
  sheet: { id: number; name: string; columns: { label: string; width?: number }[]; merges: { row: [number, number]; col: [number, number] }[]; rows: string[][]; uploadedData: string[][] | null },
): FortuneSheetData {
  return {
    id: String(sheet.id),
    name: sheet.name,
    celldata: buildCelldata(sheet.columns, sheet.rows, sheet.uploadedData),
    columnWidths: sheet.columns.reduce((acc: Record<string, number>, col, i) => {
      if (col.width) acc[i] = col.width;
      return acc;
    }, {}),
    merges: (sheet.merges || []).map((m) => ({
      row: [m.row[0] + 1, m.row[1] + 1],
      col: [m.col[0], m.col[1]],
    })),
  };
}