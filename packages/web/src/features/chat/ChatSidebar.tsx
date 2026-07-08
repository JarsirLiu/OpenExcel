import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { SessionShell } from "@/features/session/SessionShell";
import styles from "./ChatSidebar.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatSidebar({
  onWorkspaceRefresh,
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
  onAttachExcel: (file: File) => Promise<void> | void;
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
