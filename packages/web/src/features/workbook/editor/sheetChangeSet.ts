import type { FortuneCell, SheetConfig } from "@openexcel/core";
import { hasSheetChanges, type SheetChangeSet } from "@/features/sync/sheetChangeSet";
import { createSheetChangeSet } from "@/features/sync/sheetChangeSetDiff";
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

export type { SheetCellChange, SheetChangeSet } from "@/features/sync/sheetChangeSet";
