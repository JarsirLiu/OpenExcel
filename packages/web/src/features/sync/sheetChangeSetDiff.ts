import type { FortuneCell } from "@openexcel/core";
import { mergeSheetCellChange, type SheetChangeSet } from "./sheetChangeSet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";

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
): SheetChangeSet["valueChanges"][number] | null {
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

/** Builds the persistence diff from two complete Sheet snapshots. */
export function createSheetChangeSet(
  before: SheetSnapshotForSave,
  after: SheetSnapshotForSave,
): SheetChangeSet {
  const beforeCells = cellsByKey(before.celldata);
  const afterCells = cellsByKey(after.celldata);
  const valueChanges = new Map<string, SheetChangeSet["valueChanges"][number]>();
  const formulaCacheChanges = new Map<string, SheetChangeSet["formulaCacheChanges"][number]>();
  const formatChanges = new Map<string, SheetChangeSet["formatChanges"][number]>();
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
