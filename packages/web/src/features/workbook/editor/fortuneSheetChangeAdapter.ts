import type { SheetConfig } from "@openexcel/core";
import type { SheetEditorChange } from "@/features/sync/sheetEditorChange";
import type { FortuneSheetOpHint } from "./fortuneSheetOps";
import {
  materializeSheetEditorSnapshot,
  type SheetEditorSnapshot,
  updateSheetEditorSnapshotFromMatrix,
} from "./sheetMutationFromDiff";

type FortuneSheetCell = Readonly<Record<string, unknown>> | null;

export function adaptFortuneSheetChange(input: {
  sheetId: number;
  data: readonly FortuneSheetCell[][];
  config: SheetConfig | null;
  previous: SheetEditorSnapshot;
  hint?: FortuneSheetOpHint;
}): { snapshot: SheetEditorSnapshot; change: SheetEditorChange | null } {
  const result = updateSheetEditorSnapshotFromMatrix(
    input.previous,
    input.data,
    input.config,
    input.hint?.requiresSnapshot ? undefined : input.hint?.changedCellKeys,
    input.hint?.requiresSnapshot ? undefined : input.hint?.changedCellFields,
  );
  if (!result.mutation) return { snapshot: result.snapshot, change: null };

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

  if (result.mutation.type !== "patch") {
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

  return {
    snapshot: result.snapshot,
    change: {
      kind: "patch",
      sheetId: input.sheetId,
      mutation: result.mutation,
    },
  };
}
