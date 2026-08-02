import {
  applySheetMutation,
  type FortuneCell,
  type SheetChangeDelta,
  type SheetConfig,
} from "@openexcel/core";
import type { SheetSchema } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "@/features/sync/sheetChunkSnapshot";
import { sheetMutationFromDiff } from "./sheetMutationFromDiff";

export type FortuneSheetApiCall = {
  name: string;
  args: unknown[];
};

export type FortuneSheetMutationPlan = {
  snapshot: SheetSnapshotForSave;
  patch: Extract<SheetChangeDelta, { type: "patch" }> | null;
  apiCalls: FortuneSheetApiCall[];
};

function toSnapshot(sheet: SheetSchema) {
  return {
    celldata: Array.isArray(sheet.uploadedData) ? (sheet.uploadedData as FortuneCell[]) : [],
    config: (sheet.config as Record<string, unknown> | null) ?? null,
  };
}

export function planFortuneSheetMutation(
  sheet: SheetSchema,
  delta: SheetChangeDelta,
): FortuneSheetMutationPlan {
  const before = toSnapshot(sheet);
  const after = applySheetMutation(before, delta).snapshot;
  const patch = sheetMutationFromDiff(
    before.celldata,
    after.celldata,
    (sheet.config as SheetConfig | null) ?? null,
    after.config as SheetConfig | null,
  );
  const apiCalls: FortuneSheetApiCall[] =
    patch?.type === "patch"
      ? patch.cells.map((change) => ({
          name: change.cell === null ? "clearCell" : "setCellValue",
          args:
            change.cell === null
              ? [change.row - 1, change.col - 1, { id: String(sheet.id) }]
              : [change.row - 1, change.col - 1, change.cell, null, { id: String(sheet.id) }],
        }))
      : [];

  // Recalculate every loaded sheet so formulas that reference this sheet are refreshed too.
  apiCalls.push({ name: "calculateFormula", args: [] });
  return {
    snapshot: {
      celldata: after.celldata,
      config: after.config as SheetConfig | null,
    },
    patch: patch?.type === "patch" ? patch : null,
    apiCalls,
  };
}
