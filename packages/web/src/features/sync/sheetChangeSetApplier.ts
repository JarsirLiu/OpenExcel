import type { FortuneCell } from "@openexcel/core";
import { latestSheetConfigChange, type SheetChangeSet } from "./sheetChangeSet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function cloneCell(cell: FortuneCell): FortuneCell {
  return { ...cell, v: structuredClone(cell.v) };
}

function cellsByKey(celldata: readonly FortuneCell[]): Map<string, FortuneCell> {
  return new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cloneCell(cell)]));
}

/** Applies a classified diff while preserving fields absent from the diff. */
export function applySheetChangeSetToSnapshot(
  snapshot: SheetSnapshotForSave,
  changeSet: SheetChangeSet,
): SheetSnapshotForSave {
  const cells = cellsByKey(snapshot.celldata);
  for (const changes of [
    changeSet.valueChanges,
    changeSet.formulaCacheChanges,
    changeSet.formatChanges,
  ]) {
    for (const change of changes) {
      const key = cellKey(change.row - 1, change.col - 1);
      if (change.cell === null) {
        cells.delete(key);
        continue;
      }
      const current = cells.get(key);
      const nextValue: Record<string, unknown> = {
        ...((current?.v ?? {}) as unknown as Record<string, unknown>),
        ...change.cell,
      };
      for (const field of change.removed ?? []) delete nextValue[field];
      if (Object.keys(nextValue).length === 0) cells.delete(key);
      else {
        cells.set(key, {
          r: change.row - 1,
          c: change.col - 1,
          v: nextValue as unknown as FortuneCell["v"],
        });
      }
    }
  }

  const config = latestSheetConfigChange(changeSet.configChanges)?.config;
  return {
    celldata: [...cells.values()].sort((left, right) => left.r - right.r || left.c - right.c),
    config: config === undefined ? structuredClone(snapshot.config) : structuredClone(config),
  };
}
