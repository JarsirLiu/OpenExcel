import { extractSheetConfig } from "@openexcel/core";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import type { FortuneSheetData } from "./fortuneSheet";
import { adaptFortuneSheetChange } from "./fortuneSheetChangeAdapter";
import {
  collectFortuneSheetOpHints,
  type FortuneSheetOp,
  type FortuneSheetOpHint,
} from "./fortuneSheetOps";
import { createSheetEditorSnapshot, type SheetEditorSnapshot } from "./sheetEditorSnapshot";

type FortuneSheetCell = Readonly<Record<string, unknown>> | null;

type FortuneSheetChangeData = {
  id: string | number;
  data: readonly FortuneSheetCell[][];
};

type FortuneSheetChangeOptions = {
  loadedSheetIds?: ReadonlySet<number>;
};

export type FortuneSheetChangeResult = {
  sheetId: number;
  change: SheetEditorChange | null;
};

const FORMULA_ONLY_HINT: FortuneSheetOpHint = {
  requiresSnapshot: false,
  changedCellKeys: new Set(),
  changedCellFields: new Map(),
};

function toSheetId(value: string | number): number | null {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

/** Converts FortuneSheet's paired operation/change callbacks into editor changes. */
export class FortuneSheetEventAdapter {
  private readonly pendingOpHints = new Map<number, FortuneSheetOpHint>();

  private readonly snapshots = new Map<number, SheetEditorSnapshot>();

  reset(sheets: readonly FortuneSheetData[]): void {
    this.pendingOpHints.clear();
    this.snapshots.clear();

    for (const sheet of sheets) {
      const sheetId = toSheetId(sheet.id);
      if (sheetId === null) continue;
      const config = extractSheetConfig(sheet);
      const snapshot = createSheetEditorSnapshot(sheet.celldata, config);
      this.snapshots.set(sheetId, snapshot);
    }
  }

  replaceSheetSnapshot(sheetId: number, snapshot: SheetSnapshotForSave): void {
    this.pendingOpHints.delete(sheetId);
    this.snapshots.set(sheetId, createSheetEditorSnapshot(snapshot.celldata, snapshot.config));
  }

  getSheetSnapshot(sheetId: number): SheetSnapshotForSave | null {
    const snapshot = this.snapshots.get(sheetId);
    if (!snapshot) return null;
    return {
      celldata: [...snapshot.cellsByKey.values()].map((cell) => ({ ...cell, v: { ...cell.v } })),
      config: snapshot.config ? structuredClone(snapshot.config) : null,
    };
  }

  handleOp(ops: readonly FortuneSheetOp[], activeSheetId: number): void {
    const hints = collectFortuneSheetOpHints(ops, activeSheetId);
    for (const [sheetId, hint] of hints) {
      const current = this.pendingOpHints.get(sheetId);
      if (!current) {
        this.pendingOpHints.set(sheetId, hint);
        continue;
      }
      current.requiresSnapshot ||= hint.requiresSnapshot;
      for (const cellKey of hint.changedCellKeys) current.changedCellKeys.add(cellKey);
      if (hint.changedCellFields) {
        const fieldsByCell = current.changedCellFields ?? new Map<string, Set<string>>();
        for (const [cellKey, fields] of hint.changedCellFields) {
          const currentFields = fieldsByCell.get(cellKey) ?? new Set<string>();
          for (const field of fields) currentFields.add(field);
          fieldsByCell.set(cellKey, currentFields);
        }
        current.changedCellFields = fieldsByCell;
      }
    }
  }

  handleChange(
    data: readonly FortuneSheetChangeData[],
    activeSheetId: number,
    options: FortuneSheetChangeOptions = {},
  ): FortuneSheetChangeResult[] {
    const loadedSheetIds = options.loadedSheetIds;
    const results: FortuneSheetChangeResult[] = [];

    // Process the active Sheet first. FortuneSheet's onChange is the actual
    // value-change signal; onOp is only an optimization hint and is not
    // required for a manual edit to reach persistence.
    const orderedData = [
      ...data.filter((fortuneSheet) => Number(fortuneSheet.id) === activeSheetId),
      ...data.filter((fortuneSheet) => Number(fortuneSheet.id) !== activeSheetId),
    ];

    for (const fortuneSheet of orderedData) {
      const sheetId = toSheetId(fortuneSheet.id);
      if (sheetId === null) continue;
      if (loadedSheetIds && !loadedSheetIds.has(sheetId)) continue;

      const previous = this.snapshots.get(sheetId);
      if (!previous) continue;

      const hint =
        this.pendingOpHints.get(sheetId) ??
        (sheetId === activeSheetId ? undefined : FORMULA_ONLY_HINT);
      this.pendingOpHints.delete(sheetId);
      const config = extractSheetConfig(fortuneSheet);
      const result = adaptFortuneSheetChange({
        sheetId,
        data: fortuneSheet.data,
        config,
        previous,
        hint,
      });
      results.push({ sheetId, change: result.change });
    }

    return results;
  }
}
