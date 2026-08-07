import type { FortuneCell } from "@openexcel/core";
import { fetchSheet } from "@/api/workbooks";
import type { SheetSnapshotForSave } from "./sheetChunkSnapshot";
import { saveSheet } from "./sheetSaveTransport";
import type { SheetSaveRequest, SheetSaveResult } from "./sheetSaveTypes";

type SheetSaveTaskOptions = {
  workspaceId: number | null;
  sheetId: number;
  generation: number;
  isCurrent: () => boolean;
  setSaving: () => void;
  setIdle: () => void;
};

/** Creates the HTTP task used by the coordinator, including the authoritative snapshot fetch. */
export function createSheetSaveTask({
  workspaceId,
  sheetId,
  generation,
  isCurrent,
  setSaving,
  setIdle,
}: SheetSaveTaskOptions) {
  return async (request: SheetSaveRequest): Promise<SheetSaveResult> => {
    if (workspaceId == null || !isCurrent()) {
      return { revision: request.baseRevision };
    }

    setSaving();
    try {
      const result = await saveSheet(workspaceId, sheetId, request);
      if (!isCurrent()) return { revision: request.baseRevision };
      const serverSheet = await fetchSheet(workspaceId, sheetId);
      if (!isCurrent()) return { revision: request.baseRevision };
      return {
        ...result,
        snapshot: {
          celldata: (serverSheet.uploadedData ?? []) as FortuneCell[],
          config: serverSheet.config,
        } satisfies SheetSnapshotForSave,
      };
    } catch (error) {
      setIdle();
      throw error;
    }
  };
}
