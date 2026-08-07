import type { FortuneCell, SheetConfig } from "@openexcel/core";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";
import type { SheetEditorChange } from "./sheetEditorChange";

type RemoteSheetData = {
  uploadedData?: FortuneCell[] | null;
  config: SheetConfig | null;
};

type SheetConflictRebaseOptions = {
  sheetId: number;
  loadRemote: (sheetId: number) => Promise<RemoteSheetData>;
  rebase: (sheetId: number, remote: SheetSnapshotForSave) => SheetSnapshotForSave | null;
};

/** Loads the authoritative remote snapshot and turns local conflict state into an editor change. */
export async function rebaseSheetAfterConflict({
  sheetId,
  loadRemote,
  rebase,
}: SheetConflictRebaseOptions): Promise<Extract<SheetEditorChange, { kind: "snapshot" }> | null> {
  const remote = await loadRemote(sheetId);
  const rebased = rebase(sheetId, {
    celldata: remote.uploadedData ?? [],
    config: remote.config,
  });

  return rebased
    ? {
        kind: "snapshot",
        sheetId,
        snapshot: rebased,
      }
    : null;
}
