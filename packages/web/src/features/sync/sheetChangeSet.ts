import type { SheetConfig } from "@openexcel/core";

export type SheetCellChange = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
  removed?: string[];
};

export type SheetChangeSet = {
  valueChanges: SheetCellChange[];
  formulaCacheChanges: SheetCellChange[];
  formatChanges: SheetCellChange[];
  configChanges: Array<{ config: SheetConfig | null }>;
};

export function mergeSheetCellChange(
  target: Map<string, SheetCellChange>,
  change: SheetCellChange,
): void {
  const cellKey = `${change.row},${change.col}`;
  const previous = target.get(cellKey);
  if (!previous || change.cell === null || previous.cell === null) {
    target.set(cellKey, change);
    return;
  }

  const removed = new Set([...(previous.removed ?? []), ...(change.removed ?? [])]);
  for (const field of Object.keys(change.cell)) removed.delete(field);
  target.set(cellKey, {
    row: change.row,
    col: change.col,
    cell: { ...previous.cell, ...change.cell },
    ...(removed.size > 0 ? { removed: [...removed] } : {}),
  });
}

export function latestSheetConfigChange(
  changes: readonly { config: SheetConfig | null }[],
): { config: SheetConfig | null } | undefined {
  return changes.at(-1);
}

export function hasSheetChanges(changeSet: SheetChangeSet): boolean {
  return (
    changeSet.valueChanges.length > 0 ||
    changeSet.formulaCacheChanges.length > 0 ||
    changeSet.formatChanges.length > 0 ||
    changeSet.configChanges.length > 0
  );
}
