import { useCallback, useMemo, useRef, useState, useEffect } from "react";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { useWorkspaceView } from "@/features/workspace/useWorkspaceView";
import { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { useUrlSync } from "./useUrlSync";
import { useSheetActivation } from "@/features/workbook/editor/SheetActivationContext";
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
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading: workspaceLoading, refresh: workspaceRefresh, workbooksMap, refreshWorkbooks } = useWorkspaceState(routeData?.workspaces);
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
  const session = useSessionWorkspace(activeWorkspaceId, workbook.handleWorkspaceRefresh, domainInitial.session);

  useUrlSync(activeWorkspacePublicId);

  const activeWorkbookId = useMemo(
    () => workbook.currentWorkbook?.id ?? workbook.workbooks[workbook.workbookIdx]?.id ?? null,
    [workbook.currentWorkbook?.id, workbook.workbooks, workbook.workbookIdx],
  );

  // Wrappers that refresh sidebar workbooksMap after workbook mutations
  const wrappedWorkbookCreate = useCallback(async (workspaceId: number) => {
    await workbook.handleCreateWorkbook(workspaceId);
    await refreshWorkbooks(workspaces);
  }, [workbook.handleCreateWorkbook, refreshWorkbooks, workspaces]);

  const wrappedWorkbookDelete = useCallback(async (workbookId: number) => {
    await workbook.handleWorkbookDelete(workbookId);
    await refreshWorkbooks(workspaces);
  }, [workbook.handleWorkbookDelete, refreshWorkbooks, workspaces]);

  const pendingWorkbookSwitch = useRef<number | null>(null);
  const { activateSheetByIndex } = useSheetActivation();

  const handleWorkbookSelect = useCallback((workspaceId: number, workbookId: number) => {
    if (workspaceId !== activeWorkspaceId) {
      setActiveWorkspaceId(workspaceId);
      pendingWorkbookSwitch.current = workbookId;
    } else {
      const idx = workbook.workbooks.findIndex((wb) => wb.id === workbookId);
      if (idx >= 0) {
        void workbook.handleSwitchWorkbook(idx);
      }
    }
  }, [activeWorkspaceId, setActiveWorkspaceId, workbook]);

  useEffect(() => {
    if (pendingWorkbookSwitch.current == null) return;
    const targetId = pendingWorkbookSwitch.current;
    pendingWorkbookSwitch.current = null;
    const idx = workbook.workbooks.findIndex((wb) => wb.id === targetId);
    if (idx >= 0) {
      void workbook.handleSwitchWorkbook(idx);
    }
  }, [activeWorkspaceId, workbook.workbooks, workbook]);

  const handleNavigateSheet = useCallback((sheetId: number) => {
    if (!workbook.currentWorkbook) return;
    const idx = workbook.currentWorkbook.sheets.findIndex((s: any) => s.id === sheetId);
    if (idx >= 0) {
      workbook.setCurrentSheetIndex(idx);
      activateSheetByIndex(idx);
    }
  }, [workbook.currentWorkbook, workbook.setCurrentSheetIndex, activateSheetByIndex]);

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
        workbooksMap={workbooksMap}
        activeWorkbookId={activeWorkbookId}
        onWorkbookSelect={handleWorkbookSelect}
        onWorkbookDelete={wrappedWorkbookDelete}
        onWorkbookCreate={wrappedWorkbookCreate}
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
          handleWorkbookRename={workbook.handleWorkbookRename}
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
        onWorkspaceRefresh={workbook.handleWorkspaceRefresh}
        onAttachExcel={workbook.handleNewWorkbookFileChange}
        referenceCacheRevision={workbook.referenceCacheRevision}
        currentUser={currentUser}
        onLogout={onLogout}
        style={{ width: sidebarWidth }}
        sessionWorkspace={session}
        onNavigateSheet={handleNavigateSheet}
        initialMessages={domainInitial.session?.messages}
      />
    </div>
  );
}
