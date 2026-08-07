import type { SheetConfig } from "@openexcel/core";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import type { FortuneSheetOpHint } from "./fortuneSheetOps";
import { classifySheetChange } from "./sheetChangeSet";
import {
  createSheetEditorSnapshot,
  materializeSheetEditorSnapshot,
  type SheetEditorSnapshot,
} from "./sheetEditorSnapshot";
import { updateSheetEditorSnapshotFromMatrix } from "./sheetEditorSnapshotUpdater";

type FortuneSheetCell = Readonly<Record<string, unknown>> | null;

export function adaptFortuneSheetChange(input: {
  sheetId: number;
  data: readonly FortuneSheetCell[][];
  config: SheetConfig | null;
  previous: SheetEditorSnapshot;
  hint?: FortuneSheetOpHint;
}): { snapshot: SheetEditorSnapshot; change: SheetEditorChange | null } {
  const previousSnapshot = createSheetEditorSnapshot(
    materializeSheetEditorSnapshot(input.previous),
    input.previous.config,
  );
  const workingSnapshot = createSheetEditorSnapshot(
    materializeSheetEditorSnapshot(previousSnapshot),
    previousSnapshot.config,
  );
  const result = updateSheetEditorSnapshotFromMatrix(
    workingSnapshot,
    input.data,
    input.config,
    input.hint?.requiresSnapshot ? undefined : input.hint?.changedCellKeys,
    input.hint?.requiresSnapshot ? undefined : input.hint?.changedCellFields,
  );
  if (!result.changed) return { snapshot: result.snapshot, change: null };

  if (input.hint?.requiresSnapshot) {
    return {
      snapshot: result.snapshot,
      change: {
        kind: "snapshot",
        sheetId: input.sheetId,
        snapshot: {
          celldata: materializeSheetEditorSnapshot(result.snapshot),
          config: input.config,
        },
      },
    };
  }

  const changeSet = classifySheetChange(previousSnapshot, result.snapshot);
  if (
    changeSet.valueChanges.length === 0 &&
    changeSet.formulaCacheChanges.length === 0 &&
    changeSet.formatChanges.length === 0 &&
    changeSet.configChanges.length === 0
  ) {
    return { snapshot: result.snapshot, change: null };
  }
  return {
    snapshot: result.snapshot,
    change: {
      kind: "patch",
      sheetId: input.sheetId,
      changeSet,
    },
  };
}
