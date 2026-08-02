import type { SheetChangeDelta, SheetChangeVersion } from "@openexcel/core";
import { SessionShell } from "@/features/session/SessionShell";
import type { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import type { CommittedSheetMutationHandler } from "@/features/sync/sheetEditorChange";
import styles from "./ChatSidebar.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type SessionWorkspaceState = ReturnType<typeof useSessionWorkspace>;

export function ChatSidebar({
  onWorkspaceRefresh,
  onChartsRefresh,
  onSheetChanged,
  onCommittedSheetMutation,
  onAttachExcel,
  referenceCacheRevision,
  workspaceId,
  currentUser,
  onLogout,
  style,
  sessionWorkspace,
  onNavigateSheet,
}: {
  onWorkspaceRefresh?: () => Promise<void> | void;
  onChartsRefresh?: () => Promise<void> | void;
  onSheetChanged?: (
    sheetId: number,
    delta: SheetChangeDelta | null,
    version?: SheetChangeVersion,
  ) => void | Promise<void>;
  onCommittedSheetMutation?: CommittedSheetMutationHandler;
  onAttachExcel: (files: File[]) => Promise<void> | void;
  referenceCacheRevision: number;
  workspaceId: number | null;
  currentUser: CurrentUser;
  onLogout: () => void;
  style?: React.CSSProperties;
  sessionWorkspace: SessionWorkspaceState;
  onNavigateSheet?: (sheetId: number) => void;
}) {
  return (
    <div className={styles.sidebar} style={style}>
      <SessionShell
        {...sessionWorkspace}
        workspaceId={workspaceId}
        onWorkspaceRefresh={onWorkspaceRefresh}
        onChartsRefresh={onChartsRefresh}
        onSheetChanged={onSheetChanged}
        onCommittedSheetMutation={onCommittedSheetMutation}
        referenceCacheRevision={referenceCacheRevision}
        onAttachExcel={onAttachExcel}
        currentUser={currentUser}
        onLogout={onLogout}
        onNavigateSheet={onNavigateSheet}
      />
    </div>
  );
}
