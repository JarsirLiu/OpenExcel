import type { SheetChangeDelta } from "@openexcel/core";
import { useSessionWorkspace } from "../session/useSessionWorkspace";
import { SessionShell } from "../session/SessionShell";
import type { WorkbookStructureUpdate } from "./hooks/useSheetPatchSync";

type CurrentUser = {
  email: string;
  displayName: string;
};

export function ChatInterface({
  onSheetChanged,
  onWorkbookStructureChanged,
  onUndoComplete,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onUndoComplete?: () => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
}) {
  const sessionWorkspace = useSessionWorkspace(workspaceId, onUndoComplete);

  return (
    <SessionShell
      {...sessionWorkspace}
      workspaceId={workspaceId}
      onSheetChanged={onSheetChanged}
      onWorkbookStructureChanged={onWorkbookStructureChanged}
      referenceCacheRevision={referenceCacheRevision}
      onAttachExcel={onAttachExcel}
      currentUser={currentUser}
      onLogout={onLogout}
    />
  );
}
