import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import { useSheetActivation } from "@/features/workbook/editor/SheetActivationContext";
import { useWorkspaceSidebarLayout } from "@/features/workspace/useWorkspaceSidebarLayout";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { useWorkspaceView } from "@/features/workspace/useWorkspaceView";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { usePanelResize } from "@/shared/hooks/usePanelResize";
import type { WorkbenchRouteData } from "./routeData";
import styles from "./Workbench.module.css";

type CurrentUser = { email: string; displayName: string };

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
  routeData?: WorkbenchRouteData;
};

const CHAT_SIDEBAR_MIN_WIDTH = 300;

export function Workbench({ currentUser, onLogout, routeData }: Props) {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    workspaces,
    activeWorkspaceId,
    loading: workspaceLoading,
    refresh: workspaceRefresh,
    workbooksMap,
    refreshWorkbooks,
  } = useWorkspaceState(routeData?.workspaces, routeData?.workspace.id);
  const workspaceSidebarLayout = useWorkspaceSidebarLayout();

  const routeWorkspaceId = routeData?.workspace.id ?? null;
  const selectedWorkspaceId = routeWorkspaceId ?? activeWorkspaceId;

  const domainInitial = useMemo(
    () => ({
      workbook: routeData?.workbooks
        ? {
            workspaceId: routeData.workspace.id,
            workbooks: routeData.workbooks,
            currentWorkbook: routeData.currentWorkbook,
          }
        : undefined,
      session: routeData?.sessions
        ? {
            sessions: routeData.sessions,
          }
        : undefined,
    }),
    [routeData],
  );

  const workbook = useWorkspaceView(selectedWorkspaceId, domainInitial.workbook);
  const session = useSessionWorkspace(
    selectedWorkspaceId,
    workbook.handleWorkspaceRefresh,
    domainInitial.session,
  );

  const handleWorkspaceSelect = useCallback(
    (workspace: { publicId: string }) => {
      const targetPath = `/workspaces/${workspace.publicId}`;
      if (targetPath !== location.pathname) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate],
  );

  const activeWorkbookId = useMemo(
    () => workbook.currentWorkbook?.id ?? workbook.workbooks[workbook.workbookIdx]?.id ?? null,
    [workbook.currentWorkbook?.id, workbook.workbooks, workbook.workbookIdx],
  );

  const refreshUndoAvailability = useCallback(async () => {
    try {
      await session.refreshSessions();
    } catch (error) {
      console.error("[session] Failed to refresh undo availability:", error);
    }
  }, [session]);

  const handleChartMutation = useCallback(
    async (mutation: ChartMutation) => {
      workbook.handleChartMutation(mutation);
      await refreshUndoAvailability();
    },
    [refreshUndoAvailability, workbook.handleChartMutation],
  );

  // Wrappers that refresh sidebar workbooksMap after workbook mutations
  const wrappedWorkbookCreate = useCallback(
    async (workspaceId: number) => {
      await workbook.handleCreateWorkbook(workspaceId);
      await refreshWorkbooks(workspaces);
      await refreshUndoAvailability();
    },
    [workbook.handleCreateWorkbook, refreshUndoAvailability, refreshWorkbooks, workspaces],
  );

  const wrappedWorkbookDelete = useCallback(
    async (workbookId: number) => {
      await workbook.handleWorkbookDelete(workbookId);
      await refreshWorkbooks(workspaces);
      await refreshUndoAvailability();
    },
    [workbook.handleWorkbookDelete, refreshUndoAvailability, refreshWorkbooks, workspaces],
  );

  const handleWorkbookImport = useCallback(
    async (files: File[]) => {
      const changed = await workbook.handleNewWorkbookFileChange(files);
      if (changed) {
        await refreshWorkbooks(workspaces);
      }
      return changed;
    },
    [refreshWorkbooks, workbook.handleNewWorkbookFileChange, workspaces],
  );

  const handleAttachExcel = useCallback(
    async (files: File[]) => {
      await handleWorkbookImport(files);
      await refreshUndoAvailability();
    },
    [handleWorkbookImport, refreshUndoAvailability],
  );

  const handleWorkbookRename = useCallback(
    async (workbookId: number, name: string) => {
      await workbook.handleWorkbookRename(workbookId, name);
      await refreshUndoAvailability();
    },
    [workbook.handleWorkbookRename, refreshUndoAvailability],
  );

  const pendingWorkbookSwitch = useRef<{ workspaceId: number; workbookId: number } | null>(null);
  const { activateSheetByIndex } = useSheetActivation();

  const handleWorkbookSelect = useCallback(
    (workspaceId: number, workbookId: number) => {
      if (workspaceId !== selectedWorkspaceId) {
        const workspace = workspaces.find((item) => item.id === workspaceId);
        if (workspace) handleWorkspaceSelect(workspace);
        pendingWorkbookSwitch.current = { workspaceId, workbookId };
      } else {
        const idx = workbook.workbooks.findIndex((wb) => wb.id === workbookId);
        if (idx >= 0) {
          pendingWorkbookSwitch.current = null;
          void workbook.handleSwitchWorkbook(idx);
        }
      }
    },
    [handleWorkspaceSelect, selectedWorkspaceId, workbook, workspaces],
  );

  useEffect(() => {
    const pending = pendingWorkbookSwitch.current;
    if (pending == null || pending.workspaceId !== selectedWorkspaceId) return;
    const idx = workbook.workbooks.findIndex((wb) => wb.id === pending.workbookId);
    if (idx >= 0) {
      pendingWorkbookSwitch.current = null;
      void workbook.handleSwitchWorkbook(idx);
    }
  }, [selectedWorkspaceId, workbook.workbooks, workbook]);

  const handleNavigateSheet = useCallback(
    (sheetId: number) => {
      if (!workbook.currentWorkbook) return;
      const idx = workbook.currentWorkbook.sheets.findIndex((s: any) => s.id === sheetId);
      if (idx >= 0) {
        workbook.setCurrentSheetIndex(idx);
        activateSheetByIndex(idx);
      }
    },
    [workbook.currentWorkbook, workbook.setCurrentSheetIndex, activateSheetByIndex],
  );

  const chatSidebarLayout = usePanelResize({
    initialWidth: CHAT_SIDEBAR_MIN_WIDTH,
    minWidth: CHAT_SIDEBAR_MIN_WIDTH,
    edge: "left",
  });

  const loading = workbook.loading || workspaceLoading;

  return (
    <div
      className={styles.layout}
      style={{ "--chat-sidebar-width": `${chatSidebarLayout.width}px` } as CSSProperties}
    >
      <WorkspaceSidebar
        onNavigateHome={() => navigate("/")}
        activeWorkspaceId={selectedWorkspaceId}
        onWorkspaceSelect={handleWorkspaceSelect}
        workspaces={workspaces}
        onRefresh={workspaceRefresh}
        workbooksMap={workbooksMap}
        activeWorkbookId={activeWorkbookId}
        onWorkbookSelect={handleWorkbookSelect}
        onWorkbookDelete={wrappedWorkbookDelete}
        onWorkbookCreate={wrappedWorkbookCreate}
        layout={workspaceSidebarLayout}
      />
      <div className={styles.main}>
        <WorkspaceView
          key={selectedWorkspaceId ?? "no-workspace"}
          workspaceId={selectedWorkspaceId}
          workbooks={workbook.workbooks}
          workbookIdx={workbook.workbookIdx}
          currentWorkbook={workbook.currentWorkbook}
          workbookRevision={workbook.workbookRevision}
          loading={loading}
          transition={workbook.transition}
          onRetryWorkbookTransition={workbook.retryWorkbookTransition}
          currentSheetIndex={workbook.currentSheetIndex}
          setCurrentSheetIndex={workbook.setCurrentSheetIndex}
          sheetLoading={workbook.sheetLoading}
          sheetLoadError={workbook.sheetLoadError}
          onRetrySheetLoad={workbook.retryCurrentSheet}
          onSheetLoad={workbook.loadSheetById}
          handleSwitchWorkbook={workbook.handleSwitchWorkbook}
          handleNewWorkbookFileChange={handleWorkbookImport}
          handleWorkbookDelete={workbook.handleWorkbookDelete}
          handleWorkbookRename={handleWorkbookRename}
          handleWorkbookStructureChanged={workbook.handleWorkbookStructureChanged}
          handleWorkbookRefresh={workbook.handleWorkbookRefresh}
          onChartMutation={handleChartMutation}
          onWorkbookMutation={refreshUndoAvailability}
          onSheetRevisionChanged={workbook.handleSheetRevisionChanged}
        />
        <div className={styles.resizeHandle} onMouseDown={chatSidebarLayout.handleMouseDown} />
      </div>
      <ChatSidebar
        key={selectedWorkspaceId ?? "no-workspace"}
        workspaceId={selectedWorkspaceId}
        onWorkspaceRefresh={workbook.handleWorkspaceRefresh}
        onChartsRefresh={workbook.handleChartsRefresh}
        onSheetChanged={workbook.handleSheetChanged}
        onAttachExcel={handleAttachExcel}
        referenceCacheRevision={workbook.referenceCacheRevision}
        currentUser={currentUser}
        onLogout={onLogout}
        style={{ width: chatSidebarLayout.width }}
        sessionWorkspace={session}
        onNavigateSheet={handleNavigateSheet}
      />
    </div>
  );
}
