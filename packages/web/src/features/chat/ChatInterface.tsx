import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { SessionShell } from "@/features/session/SessionShell";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatInterface({
  onWorkspaceRefresh,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
  sessionWorkspace,
  onNavigateSheet,
}: {
  onWorkspaceRefresh?: () => Promise<void> | void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
  sessionWorkspace: SessionWorkspaceState;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  return (
    <SessionShell
      {...sessionWorkspace}
      workspaceId={workspaceId}
      onWorkspaceRefresh={onWorkspaceRefresh}
      referenceCacheRevision={referenceCacheRevision}
      onAttachExcel={onAttachExcel}
      currentUser={currentUser}
      onLogout={onLogout}
      onNavigateSheet={onNavigateSheet}
    />
  );
}
