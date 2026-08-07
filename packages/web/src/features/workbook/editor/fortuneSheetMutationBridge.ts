import {
  applySheetMutation,
  type FortuneCell,
  type SheetChangeDelta,
  type SheetConfig,
} from "@openexcel/core";
import type { SheetSchema } from "@/api/workbooks";
import type { SheetChangeSet } from "@/features/sync/sheetChangeSet";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { buildFortuneSheetApiCalls, type FortuneSheetApiCall } from "./fortuneSheetApiCalls";
import { classifySheetChange } from "./sheetChangeSet";
import { createSheetEditorSnapshot } from "./sheetEditorSnapshot";

export type { FortuneSheetApiCall } from "./fortuneSheetApiCalls";

export type FortuneSheetMutationPlan = {
  snapshot: SheetSnapshotForSave;
  changeSet: SheetChangeSet;
  apiCalls: FortuneSheetApiCall[];
};

function toSnapshot(sheet: SheetSchema): SheetSnapshotForSave {
  return {
    celldata: Array.isArray(sheet.uploadedData) ? (sheet.uploadedData as FortuneCell[]) : [],
    config: (sheet.config as SheetConfig | null) ?? null,
  };
}

/** Combines core mutation planning with the isolated FortuneSheet API adapter. */
export function planFortuneSheetMutation(
  sheet: SheetSchema,
  delta: SheetChangeDelta,
): FortuneSheetMutationPlan {
  const before = toSnapshot(sheet);
  const after = applySheetMutation(
    {
      celldata: before.celldata,
      config: before.config as Record<string, unknown> | null,
    },
    delta,
  ).snapshot;
  const afterSnapshot: SheetSnapshotForSave = {
    celldata: after.celldata,
    config: after.config as SheetConfig | null,
  };
  const changeSet = classifySheetChange(
    createSheetEditorSnapshot(before.celldata, before.config),
    createSheetEditorSnapshot(afterSnapshot.celldata, afterSnapshot.config),
  );
  return {
    snapshot: afterSnapshot,
    changeSet,
    apiCalls: buildFortuneSheetApiCalls(delta, before.celldata, afterSnapshot.celldata, sheet.id),
  };
}
