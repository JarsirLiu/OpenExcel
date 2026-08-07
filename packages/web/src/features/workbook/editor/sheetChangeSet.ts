import type { FortuneCell, SheetConfig } from "@openexcel/core";
import { createSheetChangeSet, type SheetChangeSet } from "@/features/sync/sheetChangeSet";
import type { SheetEditorSnapshot } from "./sheetEditorSnapshot";
import { createSheetEditorSnapshot } from "./sheetEditorSnapshot";

export function classifySheetChange(
  before: SheetEditorSnapshot,
  after: SheetEditorSnapshot,
): SheetChangeSet {
  return createSheetChangeSet(
    {
      celldata: [...before.cellsByKey.values()],
      config: before.config,
    },
    {
      celldata: [...after.cellsByKey.values()],
      config: after.config,
    },
  );
}

export function sheetChangeSetFromSnapshotDiff(
  before: SheetEditorSnapshot,
  after: SheetEditorSnapshot,
): SheetChangeSet | null {
  const changeSet = classifySheetChange(before, after);
  return hasSheetChanges(changeSet) ? changeSet : null;
}

export function sheetChangeSetFromDiff(
  before: readonly FortuneCell[],
  after: readonly FortuneCell[],
  beforeConfig: SheetConfig | null,
  afterConfig: SheetConfig | null,
): SheetChangeSet | null {
  return sheetChangeSetFromSnapshotDiff(
    createSheetEditorSnapshot(before, beforeConfig),
    createSheetEditorSnapshot(after, afterConfig),
  );
}

function hasSheetChanges(changeSet: SheetChangeSet): boolean {
  return (
    changeSet.valueChanges.length > 0 ||
    changeSet.formulaCacheChanges.length > 0 ||
    changeSet.formatChanges.length > 0 ||
    changeSet.configChanges.length > 0
  );
}

export type { SheetCellChange, SheetChangeSet } from "@/features/sync/sheetChangeSet";
