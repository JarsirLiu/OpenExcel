import type { SheetChangeSet } from "./sheetChangeSet";
import { hasSheetChanges } from "./sheetChangeSet";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";
import {
  changedSheetChunks,
  serializeSheetChunkSnapshot,
  serializeSheetConfig,
} from "./sheetChunkSnapshot";
import type { SheetSaveRequest } from "./sheetSaveTypes";

type SheetSaveRequestPlanInput = {
  baseRevision: number;
  persistedSnapshot: SheetSnapshotForSave;
  desiredSnapshot: SheetSnapshotForSave;
  changeSet: SheetChangeSet;
  requiresChunkReplacement: boolean;
};

/** Builds the transport request without changing Coordinator state. */
export function planSheetSaveRequest({
  baseRevision,
  persistedSnapshot,
  desiredSnapshot,
  changeSet,
  requiresChunkReplacement,
}: SheetSaveRequestPlanInput): SheetSaveRequest | null {
  if (requiresChunkReplacement) {
    const persistedChunks = serializeSheetChunkSnapshot(persistedSnapshot.celldata);
    const desiredChunks = serializeSheetChunkSnapshot(desiredSnapshot.celldata);
    const chunks = changedSheetChunks(persistedChunks, desiredChunks);
    const configChanged =
      serializeSheetConfig(desiredSnapshot.config) !==
      serializeSheetConfig(persistedSnapshot.config);
    if (chunks.length === 0 && !configChanged) return null;
    return {
      kind: "replaceChunks",
      baseRevision,
      config: desiredSnapshot.config,
      chunks,
    };
  }

  if (!hasSheetChanges(changeSet)) return null;
  return { kind: "changeSet", baseRevision, changeSet };
}
