import type { SheetChangeDelta } from "@openexcel/core";
import { useSessionWorkspace } from "../session/useSessionWorkspace";
import { SessionShell } from "../session/SessionShell";
import type { WorkbookStructureUpdate } from "./hooks/useSheetPatchSync";

export function ChatInterface({
  onSheetChanged,
  onWorkbookStructureChanged,
  onUndoComplete,
  referenceCacheRevision,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onUndoComplete?: () => void;
  referenceCacheRevision: number;
}) {
  const sessionWorkspace = useSessionWorkspace(onUndoComplete);

  return (
    <SessionShell
      {...sessionWorkspace}
      onSheetChanged={onSheetChanged}
      onWorkbookStructureChanged={onWorkbookStructureChanged}
      referenceCacheRevision={referenceCacheRevision}
    />
  );
}
