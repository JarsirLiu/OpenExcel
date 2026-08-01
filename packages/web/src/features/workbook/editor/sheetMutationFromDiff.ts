import {
  type FortuneCell,
  normalizeFortuneCellValue,
  type SheetChangeDelta,
  type SheetConfig,
} from "@openexcel/core";

type CellPatch = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
};

export type SheetEditorSnapshot = {
  config: SheetConfig | null;
  configSignature: string;
  cellsByKey: Map<string, FortuneCell>;
  formulaKeys: Set<string>;
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function cloneFortuneCellValue(value: FortuneCell["v"]): FortuneCell["v"] {
  const clone = { ...value };
  if (value.mc) clone.mc = { ...value.mc };
  if (value.ct) clone.ct = { ...value.ct, s: value.ct.s ? [...value.ct.s] : value.ct.s };
  if (value.bd) {
    clone.bd = {
      ...value.bd,
      ...(value.bd.t ? { t: { ...value.bd.t } } : {}),
      ...(value.bd.b ? { b: { ...value.bd.b } } : {}),
      ...(value.bd.l ? { l: { ...value.bd.l } } : {}),
      ...(value.bd.r ? { r: { ...value.bd.r } } : {}),
    };
  }
  return clone;
}

function isFormulaCell(cell: FortuneCell | undefined): boolean {
  return typeof cell?.v.f === "string" && cell.v.f.length > 0;
}

function configSignature(config: SheetConfig | null): string {
  return JSON.stringify(config);
}

export function createSheetEditorSnapshot(
  celldata: readonly FortuneCell[],
  config: SheetConfig | null,
): SheetEditorSnapshot {
  const clonedCelldata = celldata.map((cell) => ({
    ...cell,
    v: cloneFortuneCellValue(cell.v),
  }));
  const cellsByKey = new Map(clonedCelldata.map((cell) => [cellKey(cell.r, cell.c), cell]));
  return {
    config: config ? structuredClone(config) : null,
    configSignature: configSignature(config),
    cellsByKey,
    formulaKeys: new Set(
      [...cellsByKey.entries()].filter(([, cell]) => isFormulaCell(cell)).map(([key]) => key),
    ),
  };
}

export function materializeSheetEditorSnapshot(snapshot: SheetEditorSnapshot): FortuneCell[] {
  return [...snapshot.cellsByKey.values()].sort(
    (left, right) => left.r - right.r || left.c - right.c,
  );
}

export function updateSheetEditorSnapshotFromMatrix(
  previous: SheetEditorSnapshot,
  data: readonly (Readonly<Record<string, unknown>> | null)[][],
  config: SheetConfig | null,
  observedCellKeys?: ReadonlySet<string>,
): { snapshot: SheetEditorSnapshot; mutation: SheetChangeDelta | null } {
  const cells = previous.cellsByKey;
  const formulaKeys = previous.formulaKeys;
  const changedCells: CellPatch[] = [];
  const scanAllCells = observedCellKeys === undefined;
  const keysToObserve = scanAllCells ? null : new Set([...observedCellKeys, ...formulaKeys]);
  const seenKeys = new Set<string>();

  const readCell = (row: number, col: number): Readonly<Record<string, unknown>> | null => {
    const matrixRow = data[row];
    return matrixRow?.[col] ?? null;
  };

  const observeCell = (row: number, col: number) => {
    const key = cellKey(row, col);
    const rawCell = readCell(row, col);
    if (scanAllCells) seenKeys.add(key);
    if (rawCell == null) {
      if (!cells.has(key)) return;
      cells.delete(key);
      formulaKeys.delete(key);
      changedCells.push({ row: row + 1, col: col + 1, cell: null });
      return;
    }

    const normalizedValue = normalizeFortuneCellValue(rawCell as unknown as FortuneCell["v"]);
    const previousCell = cells.get(key);
    if (JSON.stringify(previousCell?.v ?? null) === JSON.stringify(normalizedValue)) return;

    const nextCell: FortuneCell = {
      r: row,
      c: col,
      v: cloneFortuneCellValue(normalizedValue),
    };
    changedCells.push({
      row: row + 1,
      col: col + 1,
      cell: { ...(nextCell.v as unknown as Record<string, unknown>) },
    });
    cells.set(key, nextCell);
    if (isFormulaCell(nextCell)) formulaKeys.add(key);
    else formulaKeys.delete(key);
  };

  if (keysToObserve) {
    for (const key of keysToObserve) {
      const [row, col] = key.split(",").map(Number);
      observeCell(row, col);
    }
  } else {
    for (let row = 0; row < data.length; row += 1) {
      const matrixRow = data[row];
      if (!matrixRow) continue;
      for (let col = 0; col < matrixRow.length; col += 1) observeCell(row, col);
    }
    for (const [key] of cells) {
      if (seenKeys.has(key)) continue;
      const [row, col] = key.split(",").map(Number);
      cells.delete(key);
      formulaKeys.delete(key);
      changedCells.push({ row: row + 1, col: col + 1, cell: null });
    }
  }

  const nextConfigSignature = configSignature(config);
  const nextSnapshot: SheetEditorSnapshot = {
    cellsByKey: cells,
    config,
    configSignature: nextConfigSignature,
    formulaKeys,
  };
  const configChanged = previous.configSignature !== nextConfigSignature;
  if (changedCells.length === 0 && !configChanged) {
    return { snapshot: nextSnapshot, mutation: null };
  }

  return {
    snapshot: nextSnapshot,
    mutation: {
      type: "patch",
      cells: changedCells,
      ...(configChanged ? { config: config as Record<string, unknown> | null } : {}),
    },
  };
}

export function sheetMutationFromSnapshotDiff(
  before: SheetEditorSnapshot,
  after: SheetEditorSnapshot,
): SheetChangeDelta | null {
  const cells: CellPatch[] = [];

  for (const [key, next] of after.cellsByKey) {
    const previous = before.cellsByKey.get(key);
    if (JSON.stringify(previous?.v ?? null) === JSON.stringify(next?.v ?? null)) continue;
    const [row, col] = key.split(",").map(Number);
    cells.push({
      row: row + 1,
      col: col + 1,
      cell: next?.v ? (next.v as unknown as Record<string, unknown>) : null,
    });
  }

  for (const key of before.cellsByKey.keys()) {
    if (after.cellsByKey.has(key)) continue;
    const [row, col] = key.split(",").map(Number);
    cells.push({ row: row + 1, col: col + 1, cell: null });
  }

  const configChanged = JSON.stringify(before.config) !== JSON.stringify(after.config);
  if (cells.length === 0 && !configChanged) return null;

  return {
    type: "patch",
    cells,
    ...(configChanged ? { config: after.config as Record<string, unknown> | null } : {}),
  };
}

export function sheetMutationFromDiff(
  before: readonly FortuneCell[],
  after: readonly FortuneCell[],
  beforeConfig: SheetConfig | null,
  afterConfig: SheetConfig | null,
): SheetChangeDelta | null {
  return sheetMutationFromSnapshotDiff(
    createSheetEditorSnapshot(before, beforeConfig),
    createSheetEditorSnapshot(after, afterConfig),
  );
}
