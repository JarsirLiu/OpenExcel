import type { FortuneCell, SheetConfig } from "@openexcel/core";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";

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

const CONTENT_FIELDS = new Set(["v", "m", "f"]);

function equals(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function cellKey(row: number, col: number): string {
  return `${row},${col}`;
}

function cloneCell(cell: FortuneCell): FortuneCell {
  return { ...cell, v: structuredClone(cell.v) };
}

function cellsByKey(celldata: readonly FortuneCell[]): Map<string, FortuneCell> {
  return new Map(celldata.map((cell) => [cellKey(cell.r, cell.c), cloneCell(cell)]));
}

function createCellDiff(
  row: number,
  col: number,
  before: FortuneCell["v"] | undefined,
  after: FortuneCell["v"] | undefined,
  fields: ReadonlySet<string>,
): SheetCellChange | null {
  if (!after) return { row, col, cell: null };

  const beforeRecord = before as unknown as Record<string, unknown> | undefined;
  const afterRecord = after as unknown as Record<string, unknown>;
  const cell: Record<string, unknown> = {};
  const removed: string[] = [];
  const allFields = new Set([...Object.keys(beforeRecord ?? {}), ...Object.keys(afterRecord)]);
  for (const field of allFields) {
    if (!fields.has(field) || equals(beforeRecord?.[field], afterRecord[field])) continue;
    if (Object.keys(afterRecord).includes(field)) cell[field] = afterRecord[field];
    else removed.push(field);
  }

  if (Object.keys(cell).length === 0 && removed.length === 0) return null;
  return {
    row,
    col,
    cell,
    ...(removed.length > 0 ? { removed } : {}),
  };
}

/** Builds the only persistence diff used by the browser save path. */
export function createSheetChangeSet(
  before: SheetSnapshotForSave,
  after: SheetSnapshotForSave,
): SheetChangeSet {
  const beforeCells = cellsByKey(before.celldata);
  const afterCells = cellsByKey(after.celldata);
  const valueChanges = new Map<string, SheetCellChange>();
  const formulaCacheChanges = new Map<string, SheetCellChange>();
  const formatChanges = new Map<string, SheetCellChange>();
  const cellKeys = new Set([...beforeCells.keys(), ...afterCells.keys()]);

  for (const key of cellKeys) {
    const beforeCell = beforeCells.get(key);
    const afterCell = afterCells.get(key);
    const [row, col] = key.split(",").map(Number);
    const beforeValue = beforeCell?.v;
    const afterValue = afterCell?.v;

    if (!afterValue) {
      if (beforeValue)
        mergeSheetCellChange(valueChanges, { row: row + 1, col: col + 1, cell: null });
      continue;
    }

    const content = createCellDiff(row + 1, col + 1, beforeValue, afterValue, CONTENT_FIELDS);
    const formulaUnchanged = typeof afterValue.f === "string" && beforeValue?.f === afterValue.f;
    if (content) {
      if (formulaUnchanged) {
        const cache = createCellDiff(
          row + 1,
          col + 1,
          beforeValue,
          afterValue,
          new Set(["v", "m"]),
        );
        if (cache) mergeSheetCellChange(formulaCacheChanges, cache);
      } else {
        mergeSheetCellChange(valueChanges, content);
      }
    }

    const formatFields = new Set(
      [...new Set([...Object.keys(beforeValue ?? {}), ...Object.keys(afterValue)])].filter(
        (field) => !CONTENT_FIELDS.has(field),
      ),
    );
    const format = createCellDiff(row + 1, col + 1, beforeValue, afterValue, formatFields);
    if (format) mergeSheetCellChange(formatChanges, format);
  }

  return {
    valueChanges: [...valueChanges.values()],
    formulaCacheChanges: [...formulaCacheChanges.values()],
    formatChanges: [...formatChanges.values()],
    configChanges: equals(before.config, after.config) ? [] : [{ config: after.config }],
  };
}

/** Applies a classified diff to a snapshot without replacing unrelated fields. */
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
