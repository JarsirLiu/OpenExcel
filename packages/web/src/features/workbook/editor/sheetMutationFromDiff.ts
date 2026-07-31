import type { FortuneCell, SheetChangeDelta, SheetConfig } from "@openexcel/core";

type CellPatch = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function buildCellMap(celldata: readonly FortuneCell[]): Map<string, FortuneCell> {
  return new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
}

export function sheetMutationFromDiff(
  before: readonly FortuneCell[],
  after: readonly FortuneCell[],
  beforeConfig: SheetConfig | null,
  afterConfig: SheetConfig | null,
): SheetChangeDelta | null {
  const beforeCells = buildCellMap(before);
  const afterCells = buildCellMap(after);
  const keys = new Set([...beforeCells.keys(), ...afterCells.keys()]);
  const cells: CellPatch[] = [];

  for (const key of keys) {
    const previous = beforeCells.get(key);
    const next = afterCells.get(key);
    if (JSON.stringify(previous?.v ?? null) === JSON.stringify(next?.v ?? null)) continue;
    const [row, col] = key.split(",").map(Number);
    cells.push({
      row: row + 1,
      col: col + 1,
      cell: next?.v ? (next.v as unknown as Record<string, unknown>) : null,
    });
  }

  const configChanged = JSON.stringify(beforeConfig) !== JSON.stringify(afterConfig);
  if (cells.length === 0 && !configChanged) return null;

  return {
    type: "patch",
    cells,
    ...(configChanged ? { config: afterConfig as Record<string, unknown> | null } : {}),
  };
}
