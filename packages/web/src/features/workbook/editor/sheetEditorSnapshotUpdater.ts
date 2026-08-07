import { type FortuneCell, normalizeFortuneCellValue, type SheetConfig } from "@openexcel/core";
import {
  cellKey,
  cloneFortuneCellValue,
  configSignature,
  type SheetEditorSnapshot,
} from "./sheetEditorSnapshot";

type CellPatch = {
  row: number;
  col: number;
  cell: Record<string, unknown> | null;
  removed?: string[];
};

const CONTENT_FIELDS = new Set(["v", "m", "f"]);

function hasOwnField(value: object, field: string): boolean {
  return Object.keys(value).includes(field);
}

function mergeObservedCellValue(
  previous: FortuneCell["v"] | undefined,
  observed: FortuneCell["v"] | null,
  changedFields: ReadonlySet<string> | undefined,
  contentOnly: boolean,
): FortuneCell["v"] | null {
  if (observed === null) {
    if (!previous) return null;
    const next = { ...previous } as Record<string, unknown>;
    const fields = contentOnly ? CONTENT_FIELDS : changedFields;
    if (!fields || fields.size === 0) return null;
    for (const field of fields) delete next[field];
    return Object.keys(next).length > 0 ? (next as unknown as FortuneCell["v"]) : null;
  }

  const next = { ...(previous ?? {}), ...observed } as Record<string, unknown>;
  if (changedFields) {
    for (const field of changedFields) {
      if (!hasOwnField(observed, field)) delete next[field];
    }
  }
  return next as unknown as FortuneCell["v"];
}

function diffCellValue(
  previous: FortuneCell["v"] | undefined,
  next: FortuneCell["v"] | null,
  changedFields: ReadonlySet<string> | undefined,
  contentOnly: boolean,
): { cell: Record<string, unknown> | null; removed?: string[] } {
  if (next === null) return { cell: null };

  const cell: Record<string, unknown> = {};
  const removed: string[] = [];
  const previousRecord = previous as unknown as Record<string, unknown> | undefined;
  const nextRecord = next as unknown as Record<string, unknown>;
  const fields = new Set([...Object.keys(previousRecord ?? {}), ...Object.keys(nextRecord)]);
  for (const field of fields) {
    if (contentOnly && !CONTENT_FIELDS.has(field)) continue;
    if (JSON.stringify(previousRecord?.[field]) === JSON.stringify(nextRecord[field])) continue;
    if (hasOwnField(nextRecord, field)) cell[field] = nextRecord[field];
    else if (changedFields?.has(field)) removed.push(field);
  }
  return {
    cell,
    ...(removed.length > 0 ? { removed } : {}),
  };
}

export function updateSheetEditorSnapshotFromMatrix(
  previous: SheetEditorSnapshot,
  data: readonly (Readonly<Record<string, unknown>> | null)[][],
  config: SheetConfig | null,
  observedCellKeys?: ReadonlySet<string>,
  changedCellFields?: ReadonlyMap<string, ReadonlySet<string>>,
  options?: { contentOnly?: boolean },
): { snapshot: SheetEditorSnapshot; changed: boolean } {
  const contentOnly = options?.contentOnly ?? false;
  const cells = new Map(
    [...previous.cellsByKey.entries()].map(([key, cell]) => [
      key,
      { ...cell, v: cloneFortuneCellValue(cell.v) },
    ]),
  );
  const formulaKeys = new Set(previous.formulaKeys);
  const changedCells: CellPatch[] = [];
  const scanAllCells = observedCellKeys === undefined;
  const keysToObserve = scanAllCells ? null : new Set([...observedCellKeys, ...formulaKeys]);
  const seenKeys = new Set<string>();

  const observeCell = (row: number, col: number) => {
    const key = cellKey(row, col);
    const rawCell = data[row]?.[col] ?? null;
    if (scanAllCells) seenKeys.add(key);
    const previousCell = cells.get(key);
    const changedFields = changedCellFields?.get(key);
    const normalizedValue =
      rawCell == null ? null : normalizeFortuneCellValue(rawCell as unknown as FortuneCell["v"]);
    const nextValue = mergeObservedCellValue(
      previousCell?.v,
      normalizedValue,
      changedFields,
      contentOnly,
    );
    if (JSON.stringify(previousCell?.v ?? null) === JSON.stringify(nextValue)) return;

    const patch = diffCellValue(previousCell?.v, nextValue, changedFields, contentOnly);
    if (nextValue === null) {
      cells.delete(key);
      formulaKeys.delete(key);
      changedCells.push({ row: row + 1, col: col + 1, cell: null });
      return;
    }

    const nextCell: FortuneCell = {
      r: row,
      c: col,
      v: cloneFortuneCellValue(nextValue),
    };
    if (Object.keys(patch.cell ?? {}).length > 0 || (patch.removed?.length ?? 0) > 0) {
      changedCells.push({ row: row + 1, col: col + 1, ...patch });
    }
    cells.set(key, nextCell);
    if (typeof nextCell.v.f === "string" && nextCell.v.f.length > 0) formulaKeys.add(key);
    else formulaKeys.delete(key);
  };

  if (keysToObserve) {
    for (const key of keysToObserve) {
      const [row, col] = key.split(",").map(Number);
      observeCell(row, col);
    }
  } else {
    for (let row = 0; row < data.length; row += 1) {
      for (let col = 0; col < (data[row]?.length ?? 0); col += 1) observeCell(row, col);
    }
    for (const [key, previousCell] of cells) {
      if (seenKeys.has(key)) continue;
      const [row, col] = key.split(",").map(Number);
      if (contentOnly) {
        const next = { ...previousCell.v } as Record<string, unknown>;
        for (const field of CONTENT_FIELDS) delete next[field];
        if (Object.keys(next).length > 0) {
          cells.set(key, { ...previousCell, v: next as unknown as FortuneCell["v"] });
          formulaKeys.delete(key);
          changedCells.push({
            row: row + 1,
            col: col + 1,
            cell: {},
            removed: [...CONTENT_FIELDS].filter((field) =>
              Object.keys(previousCell.v).includes(field),
            ),
          });
          continue;
        }
      }
      cells.delete(key);
      formulaKeys.delete(key);
      changedCells.push({ row: row + 1, col: col + 1, cell: null });
    }
  }

  const nextConfig = contentOnly ? previous.config : config;
  const nextConfigSignature = configSignature(nextConfig);
  const nextSnapshot: SheetEditorSnapshot = {
    cellsByKey: cells,
    config: nextConfig,
    configSignature: nextConfigSignature,
    formulaKeys,
  };
  const configChanged = !contentOnly && previous.configSignature !== nextConfigSignature;
  return {
    snapshot: nextSnapshot,
    changed: changedCells.length > 0 || configChanged,
  };
}
