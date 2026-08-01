import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import type { ChartMutation } from "@/features/workbook/charts/chartMutation";
import { useSheetActivation } from "@/features/workbook/editor/SheetActivationContext";
import { importWarningMessage } from "@/features/workspace/importWarnings";
import {
  createProject,
  createProjectFromImport,
  createProjectWithBlankWorkbook,
} from "@/features/workspace/projectCreation";
import { useWorkspaceSidebarLayout } from "@/features/workspace/useWorkspaceSidebarLayout";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { useWorkspaceView } from "@/features/workspace/useWorkspaceView";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import { WorkspaceView } from "@/features/workspace/WorkspaceView";
import { t } from "@/lib/i18n";
import { usePanelResize } from "@/shared/hooks/usePanelResize";
import { toast } from "@/shared/lib";
import type { WorkbenchRouteData } from "./routeData";
import { routePaths } from "./routePaths";
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
    removeWorkspace,
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
      const targetPath = routePaths.workspace(workspace.publicId);
      if (targetPath !== location.pathname) {
        navigate(targetPath);
      }
    },
    [location.pathname, navigate],
  );

  const handleWorkspaceDelete = useCallback(
    async (workspaceId: number) => {
      const remaining = await removeWorkspace(workspaceId);
      if (workspaceId !== selectedWorkspaceId) return;

      const nextWorkspace = remaining[0];
      navigate(
        nextWorkspace ? routePaths.workspace(nextWorkspace.publicId) : routePaths.workspaceRoot,
        { replace: true },
      );
    },
    [navigate, removeWorkspace, selectedWorkspaceId],
  );

  const handleWorkspaceCreate = useCallback(async () => {
    try {
      return await createProject();
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : t("create_project_failed"),
        variant: "error",
      });
      throw error;
    }
  }, []);

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

  const handleCreateEmptyWorkbook = useCallback(async () => {
    try {
      if (selectedWorkspaceId != null) {
        await workbook.handleCreateWorkbook(selectedWorkspaceId);
        await refreshWorkbooks(workspaces);
        return;
      }
      const workspace = await createProjectWithBlankWorkbook();
      navigate(routePaths.workspace(workspace.publicId));
    } catch (error) {
      toast({
        message: error instanceof Error ? error.message : t("create_workbook_failed"),
        variant: "error",
      });
    }
  }, [navigate, refreshWorkbooks, selectedWorkspaceId, workbook.handleCreateWorkbook, workspaces]);

  const handleImportEmptyWorkbook = useCallback(
    async (file: File) => {
      if (selectedWorkspaceId != null) {
        await handleWorkbookImport([file]);
        return;
      }

      try {
        const { workspace, imported } = await createProjectFromImport(file);
        const warning = importWarningMessage(imported);
        if (warning) toast({ message: warning, variant: "warning" });
        navigate(routePaths.workspace(workspace.publicId));
      } catch (error) {
        toast({
          message: error instanceof Error ? error.message : t("workbook_upload_failed"),
          variant: "error",
        });
      }
    },
    [handleWorkbookImport, navigate, selectedWorkspaceId],
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
        onWorkspaceCreate={handleWorkspaceCreate}
        onWorkspaceDelete={handleWorkspaceDelete}
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
          onCreateEmptyWorkbook={handleCreateEmptyWorkbook}
          onImportEmptyWorkbook={handleImportEmptyWorkbook}
          handleWorkbookDelete={workbook.handleWorkbookDelete}
          handleWorkbookRename={handleWorkbookRename}
          handleWorkbookStructureChanged={workbook.handleWorkbookStructureChanged}
          handleWorkbookRefresh={workbook.handleWorkbookRefresh}
          onChartMutation={handleChartMutation}
          onWorkbookMutation={refreshUndoAvailability}
          onSheetRevisionChanged={workbook.handleSheetRevisionChanged}
          onSheetContentChanged={workbook.handleSheetContentChanged}
        />
        <div className={styles.resizeHandle} onMouseDown={chatSidebarLayout.handleMouseDown} />
      </div>
      {selectedWorkspaceId != null && (
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
      )}
    </div>
  );
}
