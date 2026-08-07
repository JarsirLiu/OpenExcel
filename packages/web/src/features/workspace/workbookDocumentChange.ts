import type { FortuneCell, SheetConfig } from "@openexcel/core";
import type { SheetCellChange, SheetChangeSet } from "@/features/sync/sheetChangeSet";

export type SheetCellCache = {
  source: readonly FortuneCell[];
  indexes: Map<string, number>;
};

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function configSignature(config: SheetConfig | null): string {
  return JSON.stringify(config);
}

export function createCellCache(celldata: readonly FortuneCell[]): SheetCellCache {
  return {
    source: celldata,
    indexes: new Map(celldata.map((cell, index) => [cellKey(cell.r, cell.c), index])),
  };
}

function applyCellChanges(
  cache: SheetCellCache,
  changes: readonly SheetCellChange[],
): { celldata: FortuneCell[]; cache: SheetCellCache } {
  const nextCelldata: (FortuneCell | null)[] = [...cache.source];
  let indexes = cache.indexes;
  let requiresCompaction = false;

  const ensureWritableIndexes = () => {
    if (indexes === cache.indexes) indexes = new Map(indexes);
  };

  for (const change of changes) {
    const row = change.row - 1;
    const col = change.col - 1;
    const key = cellKey(row, col);
    const index = indexes.get(key);
    if (change.cell === null) {
      if (index !== undefined) {
        nextCelldata[index] = null;
        ensureWritableIndexes();
        indexes.delete(key);
        requiresCompaction = true;
      }
      continue;
    }

    const previousCell = index === undefined ? undefined : nextCelldata[index];
    const nextValue: Record<string, unknown> = {
      ...((previousCell?.v ?? {}) as unknown as Record<string, unknown>),
      ...change.cell,
    };
    for (const field of change.removed ?? []) delete nextValue[field];
    const nextCell = {
      r: row,
      c: col,
      v: nextValue as unknown as FortuneCell["v"],
    };
    if (index === undefined) {
      ensureWritableIndexes();
      indexes.set(key, nextCelldata.length);
      nextCelldata.push(nextCell);
      requiresCompaction = true;
    } else {
      nextCelldata[index] = nextCell;
    }
  }

  if (requiresCompaction) {
    const compacted = nextCelldata.filter((cell): cell is FortuneCell => cell !== null);
    compacted.sort((left, right) => left.r - right.r || left.c - right.c);
    return { celldata: compacted, cache: createCellCache(compacted) };
  }

  const celldata = nextCelldata as FortuneCell[];
  return { celldata, cache: { source: celldata, indexes } };
}

export function applySheetChangeSet(
  cache: SheetCellCache,
  changeSet: SheetChangeSet,
): { celldata: FortuneCell[]; cache: SheetCellCache; config?: SheetConfig | null } {
  let result = { celldata: [...cache.source], cache };
  for (const changes of [
    changeSet.valueChanges,
    changeSet.formulaCacheChanges,
    changeSet.formatChanges,
  ]) {
    result = applyCellChanges(result.cache, changes);
  }
  const configChange = changeSet.configChanges.at(-1);
  return {
    ...result,
    ...(configChange ? { config: configChange.config } : {}),
  };
}

export function hasConfigChanged(previous: SheetConfig | null, next: SheetConfig | null): boolean {
  return configSignature(previous) !== configSignature(next);
}
