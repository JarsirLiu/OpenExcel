import type { SheetChangeDelta } from "@openexcel/core";
import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { SessionShell } from "@/features/session/SessionShell";
import type { WorkbookStructureUpdate } from "@/features/chat/hooks/useSheetPatchSync";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatInterface({
  onSheetChanged,
  onWorkbookStructureChanged,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
  sessionWorkspace,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
  sessionWorkspace: SessionWorkspaceState;
}) {
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
