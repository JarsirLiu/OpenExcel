import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { WorkbookWorkspace } from "@/features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "@/features/workbook/workspace/useWorkbookWorkspace";
import { useSessionWorkspace } from "@/features/session/useSessionWorkspace";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import type { Workspace } from "@/api/workspaces";
import styles from "./Workbench.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
  initialWorkspaces?: Workspace[];
};

const MIN_SIDEBAR_WIDTH = 300;

export function Workbench({ currentUser, onLogout, initialWorkspaces }: Props) {
  const navigate = useNavigate();
  const params = useParams<{ workspacePublicId?: string; workbookPublicId?: string; sessionPublicId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const { workspaces, activeWorkspaceId, setActiveWorkspaceId, loading: workspaceLoading } = useWorkspaceState(initialWorkspaces);
  const [sidebarWidth, setSidebarWidth] = useState(MIN_SIDEBAR_WIDTH);
  const rafRef = useRef<number | null>(null);

  const activeWorkspacePublicId = workspaces.find((w) => w.id === activeWorkspaceId)?.publicId ?? null;

  useEffect(() => {
    if (params.workspacePublicId && workspaces.length > 0) {
      const matched = workspaces.find((w) => w.publicId === params.workspacePublicId);
      if (matched && matched.id !== activeWorkspaceId) {
        setActiveWorkspaceId(matched.id);
      }
    }
  }, [params.workspacePublicId, workspaces, activeWorkspaceId, setActiveWorkspaceId]);

  useEffect(() => {
    if (activeWorkspacePublicId && activeWorkspacePublicId !== params.workspacePublicId) {
      navigate(`/workspaces/${activeWorkspacePublicId}`, { replace: true });
    }
  }, [activeWorkspacePublicId, params.workspacePublicId, navigate]);

  const {
    workbooks,
    workbookIdx,
    currentWorkbook,
    workbookRevision,
    status,
    loading,
    currentSheetIndex,
    importPreview,
    importSheetIndex,
    importing,
    referenceCacheRevision,
    setCurrentSheetIndex,
    setImportSheetIndex,
    handleSheetChanged,
    handleWorkbookStructureChanged,
    handleWorkbookRefresh,
    handleSwitchWorkbook,
    handleUploadFileChange,
    handleImportConfirm,
    handleImportCancel,
    handleNewWorkbookFileChange,
    handleWorkbookDelete,
  } = useWorkbookWorkspace(activeWorkspaceId);

  const sessionWorkspace = useSessionWorkspace(activeWorkspaceId, handleWorkbookRefresh);

  const currentWbPublicId = workbooks[workbookIdx]?.publicId ?? null;

  useEffect(() => {
    if (params.workbookPublicId && workbooks.length > 0) {
      const matchIdx = workbooks.findIndex((wb) => wb.publicId === params.workbookPublicId);
      if (matchIdx >= 0 && matchIdx !== workbookIdx) {
        handleSwitchWorkbook(matchIdx);
      }
    }
  }, [params.workbookPublicId, workbooks, workbookIdx, handleSwitchWorkbook]);

  useEffect(() => {
    if (currentWbPublicId && currentWbPublicId !== params.workbookPublicId) {
      navigate(`/workspaces/${activeWorkspacePublicId}/workbooks/${currentWbPublicId}`, { replace: true });
    }
  }, [currentWbPublicId, params.workbookPublicId, activeWorkspacePublicId, navigate]);

  useEffect(() => {
    const sheetParam = searchParams.get("sheet");
    if (sheetParam !== null && currentWorkbook) {
      const idx = parseInt(sheetParam, 10);
      if (!isNaN(idx) && idx >= 0 && idx < currentWorkbook.sheets.length && idx !== currentSheetIndex) {
        setCurrentSheetIndex(idx);
      }
    }
  }, [searchParams, currentWorkbook, currentSheetIndex, setCurrentSheetIndex]);

  useEffect(() => {
    const currentSheetParam = searchParams.get("sheet");
    const expectedSheetParam = String(currentSheetIndex);
    if (currentSheetParam !== expectedSheetParam) {
      const newParams = new URLSearchParams(searchParams);
      newParams.set("sheet", expectedSheetParam);
      setSearchParams(newParams, { replace: true });
    }
  }, [currentSheetIndex, searchParams, setSearchParams]);

  useEffect(() => {
    if (params.sessionPublicId && sessionWorkspace.sessions.length > 0) {
      const match = sessionWorkspace.sessions.find((s) => s.publicId === params.sessionPublicId);
      if (match && match.id !== sessionWorkspace.currentSessionId) {
        sessionWorkspace.handleSelectSession(match.id);
      }
    }
  }, [params.sessionPublicId, sessionWorkspace.sessions, sessionWorkspace.currentSessionId, sessionWorkspace.handleSelectSession]);

  useEffect(() => {
    const currentSession = sessionWorkspace.sessions.find((s) => s.id === sessionWorkspace.currentSessionId);
    if (currentSession?.publicId && currentSession.publicId !== params.sessionPublicId) {
      const workbookSegment = currentWbPublicId ? `/workbooks/${currentWbPublicId}` : "";
      navigate(`/workspaces/${activeWorkspacePublicId}${workbookSegment}/sessions/${currentSession.publicId}`, { replace: true });
    }
  }, [sessionWorkspace.currentSessionId, sessionWorkspace.sessions, currentWbPublicId, activeWorkspacePublicId, params.sessionPublicId, navigate]);

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

  return (
    <div className={styles.layout}>
      <WorkspaceSidebar
        activeWorkspaceId={activeWorkspaceId}
        onActiveWorkspaceChange={setActiveWorkspaceId}
      />
      <div className={styles.main}>
        <WorkbookWorkspace
          workspaceId={activeWorkspaceId}
          workbooks={workbooks}
          workbookIdx={workbookIdx}
          currentWorkbook={currentWorkbook}
          workbookRevision={workbookRevision}
          status={status}
          loading={loading || workspaceLoading}
          currentSheetIndex={currentSheetIndex}
          importPreview={importPreview}
          importSheetIndex={importSheetIndex}
          importing={importing}
          setCurrentSheetIndex={setCurrentSheetIndex}
          setImportSheetIndex={setImportSheetIndex}
          handleSwitchWorkbook={handleSwitchWorkbook}
          handleUploadFileChange={handleUploadFileChange}
          handleImportConfirm={handleImportConfirm}
          handleImportCancel={handleImportCancel}
          handleNewWorkbookFileChange={handleNewWorkbookFileChange}
          handleWorkbookDelete={handleWorkbookDelete}
          handleWorkbookStructureChanged={handleWorkbookStructureChanged}
          handleWorkbookRefresh={handleWorkbookRefresh}
        />
        <div
          className={styles.resizeHandle}
          onMouseDown={handleResizeMouseDown}
        />
      </div>
      <ChatSidebar
        workspaceId={activeWorkspaceId}
        onSheetChanged={handleSheetChanged}
        onWorkbookStructureChanged={handleWorkbookStructureChanged}
        onAttachExcel={handleNewWorkbookFileChange}
        referenceCacheRevision={referenceCacheRevision}
        currentUser={currentUser}
        onLogout={onLogout}
        style={{ width: sidebarWidth }}
        sessionWorkspace={sessionWorkspace}
      />
    </div>
  );
}