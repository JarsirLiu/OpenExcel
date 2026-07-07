import { useCallback, useMemo, useRef, useState } from "react";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { useWorkspaceView } from "@/features/workspace/useWorkspaceView";
import { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { useUrlSync } from "./useUrlSync";
import type { Workspace } from "@/api/workspaces";
import type { WorkbookMeta, WorkbookFull } from "@/api/workbooks";
import type { Session } from "@/api/sessions";
import styles from "./Workbench.module.css";

type CurrentUser = { email: string; displayName: string };

export type RouteData = {
  workspaces: Workspace[];
  workspace: Workspace;
  workbooks: WorkbookMeta[];
  sessions: Session[];
  currentWorkbook?: WorkbookFull;
  messages?: unknown[];
  messageTotal?: number;
};

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
  routeData?: RouteData;
};

const MIN_SIDEBAR_WIDTH = 300;

export function Workbench({ currentUser, onLogout, routeData }: Props) {
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading: workspaceLoading, refresh: workspaceRefresh } = useWorkspaceState(routeData?.workspaces);
  const [sidebarWidth, setSidebarWidth] = useState(MIN_SIDEBAR_WIDTH);
  const rafRef = useRef<number | null>(null);

  const activeWorkspacePublicId = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId)?.publicId ?? null,
    [workspaces, activeWorkspaceId],
  );

  const domainInitial = useMemo(() => ({
    workbook: routeData?.workbooks
      ? { workbooks: routeData.workbooks, currentWorkbook: routeData.currentWorkbook ?? null }
      : undefined,
    session: routeData?.sessions
      ? { sessions: routeData.sessions, messages: routeData.messages, messageTotal: routeData.messageTotal }
      : undefined,
  }), [routeData]);

  const workbook = useWorkspaceView(activeWorkspaceId, domainInitial.workbook);
  const session = useSessionWorkspace(activeWorkspaceId, workbook.handleWorkbookRefresh, domainInitial.session);

  useUrlSync(activeWorkspacePublicId);

  const handleResizeMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = sidebarWidth;

      const onMouseMove = (e: MouseEvent) => {
        const newWidth = startWidth + (startX - e.clientX);
        setSidebarWidth(Math.max(MIN_SIDEBAR_WIDTH, newWidth));
        if (rafRef.current == null) {
          rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            window.dispatchEvent(new Event("resize"));
          });
        }
      };

      const onMouseUp = () => {
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (rafRef.current != null) {
          cancelAnimationFrame(rafRef.current);
          rafRef.current = null;
        }
        window.dispatchEvent(new Event("resize"));
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    },
    [sidebarWidth],
  );

  const loading = workbook.loading || workspaceLoading;

  return (
    <div className={styles.layout}>
      <WorkspaceSidebar
        activeWorkspaceId={activeWorkspaceId}
        onActiveWorkspaceChange={setActiveWorkspaceId}
        workspaces={workspaces}
        onRefresh={workspaceRefresh}
      />
      <div className={styles.main}>
        <WorkspaceView
          workspaceId={activeWorkspaceId}
          workbooks={workbook.workbooks}
          workbookIdx={workbook.workbookIdx}
          currentWorkbook={workbook.currentWorkbook}
          workbookRevision={workbook.workbookRevision}
          status={workbook.status}
          loading={loading}
          currentSheetIndex={workbook.currentSheetIndex}
          importPreview={workbook.importPreview}
          importSheetIndex={workbook.importSheetIndex}
          importing={workbook.importing}
          setCurrentSheetIndex={workbook.setCurrentSheetIndex}
          setImportSheetIndex={workbook.setImportSheetIndex}
          handleSwitchWorkbook={workbook.handleSwitchWorkbook}
          handleUploadFileChange={workbook.handleUploadFileChange}
          handleImportConfirm={workbook.handleImportConfirm}
          handleImportCancel={workbook.handleImportCancel}
          handleNewWorkbookFileChange={workbook.handleNewWorkbookFileChange}
          handleWorkbookDelete={workbook.handleWorkbookDelete}
          handleWorkbookStructureChanged={workbook.handleWorkbookStructureChanged}
          handleWorkbookRefresh={workbook.handleWorkbookRefresh}
        />
        <div
          className={styles.resizeHandle}
          onMouseDown={handleResizeMouseDown}
        />
      </div>
      <ChatSidebar
        workspaceId={activeWorkspaceId}
        onSheetChanged={workbook.handleSheetChanged}
        onWorkbookStructureChanged={workbook.handleWorkbookStructureChanged}
        onAttachExcel={workbook.handleNewWorkbookFileChange}
        referenceCacheRevision={workbook.referenceCacheRevision}
        currentUser={currentUser}
        onLogout={onLogout}
        style={{ width: sidebarWidth }}
        sessionWorkspace={session}
      />
    </div>
  );
}