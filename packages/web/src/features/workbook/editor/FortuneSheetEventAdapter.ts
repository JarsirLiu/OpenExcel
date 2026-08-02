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
import { createSheetEditorSnapshot, type SheetEditorSnapshot } from "./sheetMutationFromDiff";

type FortuneSheetCell = Readonly<Record<string, unknown>> | null;

type FortuneSheetChangeData = {
  id: string | number;
  data: readonly FortuneSheetCell[][];
};

export type FortuneSheetChangeResult = {
  sheetId: number;
  change: SheetEditorChange | null;
};

const FORMULA_ONLY_HINT: FortuneSheetOpHint = {
  requiresSnapshot: false,
  changedCellKeys: new Set(),
};

function toSheetId(value: string | number): number | null {
  const id = Number(value);
  return Number.isInteger(id) ? id : null;
}

/** Converts FortuneSheet's paired operation/change callbacks into editor changes. */
export class FortuneSheetEventAdapter {
  private readonly pendingOpHints = new Map<number, FortuneSheetOpHint>();

  private readonly snapshots = new Map<number, SheetEditorSnapshot>();

  reset(sheets: readonly FortuneSheetData[]): Map<number, SheetSnapshotForSave> {
    this.pendingOpHints.clear();
    this.snapshots.clear();
    const saveSnapshots = new Map<number, SheetSnapshotForSave>();

    for (const sheet of sheets) {
      const sheetId = toSheetId(sheet.id);
      if (sheetId === null) continue;
      const config = extractSheetConfig(sheet);
      const snapshot = createSheetEditorSnapshot(sheet.celldata, config);
      this.snapshots.set(sheetId, snapshot);
      saveSnapshots.set(sheetId, {
        celldata: [...snapshot.cellsByKey.values()],
        config,
      });
    }

    return saveSnapshots;
  }

  replaceSheetSnapshot(sheetId: number, snapshot: SheetSnapshotForSave): void {
    this.pendingOpHints.delete(sheetId);
    this.snapshots.set(sheetId, createSheetEditorSnapshot(snapshot.celldata, snapshot.config));
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
    }
  }

  handleChange(
    data: readonly FortuneSheetChangeData[],
    activeSheetId: number,
  ): FortuneSheetChangeResult[] {
    const results: FortuneSheetChangeResult[] = [];

    for (const fortuneSheet of data) {
      const sheetId = toSheetId(fortuneSheet.id);
      if (sheetId === null) continue;

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
      this.snapshots.set(sheetId, result.snapshot);
      results.push({ sheetId, change: result.change });
    }

    return results;
  }
}
