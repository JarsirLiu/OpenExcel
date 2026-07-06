import type { SheetChangeDelta } from "@openexcel/core";
import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { ChatInterface } from "./ChatInterface";
import type { WorkbookStructureUpdate } from "./hooks/useSheetPatchSync";
import styles from "./ChatSidebar.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatSidebar({
  onSheetChanged,
  onWorkbookStructureChanged,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
  style,
  sessionWorkspace,
}: {
  onSheetChanged?: (sheetId: number, delta: SheetChangeDelta | null) => void;
  onWorkbookStructureChanged?: (update: WorkbookStructureUpdate) => void;
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
        onSheetChanged={onSheetChanged}
        onWorkbookStructureChanged={onWorkbookStructureChanged}
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