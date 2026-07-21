import type { SheetChangeDelta } from "@openexcel/core";
import { SessionShell } from "@/features/session/SessionShell";
import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import styles from "./ChatSidebar.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatSidebar({
  onWorkspaceRefresh,
  onSheetChanged,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
  style,
  sessionWorkspace,
  onNavigateSheet,
  initialMessages,
}: {
  onWorkspaceRefresh?: () => Promise<void> | void;
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void | Promise<void>;
  onAttachExcel: (files: File[]) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
  style?: React.CSSProperties;
  sessionWorkspace: SessionWorkspaceState;
  onNavigateSheet?: (sheetId: number) => void;
  initialMessages?: unknown[];
}) {
  return (
    <div className={styles.sidebar} style={style}>
      <SessionShell
        {...sessionWorkspace}
        workspaceId={workspaceId}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onSheetChanged={onSheetChanged}
        referenceCacheRevision={referenceCacheRevision}
        onAttachExcel={onAttachExcel}
        currentUser={currentUser}
        onLogout={onLogout}
        onNavigateSheet={onNavigateSheet}
        initialMessages={initialMessages}
      />
    </div>
  );
}
