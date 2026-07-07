import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { ChatInterface } from "./ChatInterface";
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
}: {
  onWorkspaceRefresh?: () => Promise<void> | void;
  onAttachExcel: (file: File) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
  style?: React.CSSProperties;
  sessionWorkspace: SessionWorkspaceState;
}) {
  return (
    <div className={styles.sidebar} style={style}>
      <ChatInterface
        onWorkspaceRefresh={onWorkspaceRefresh}
        onAttachExcel={onAttachExcel}
        referenceCacheRevision={referenceCacheRevision}
        workspaceId={workspaceId}
        currentUser={currentUser}
        onLogout={onLogout}
        sessionWorkspace={sessionWorkspace}
      />
    </div>
  );
}
