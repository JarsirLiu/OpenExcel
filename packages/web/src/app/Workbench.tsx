import { useCallback, useRef, useState } from "react";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { WorkbookWorkspace } from "@/features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "@/features/workbook/workspace/useWorkbookWorkspace";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import { WorkspaceSidebar } from "@/features/workspace/WorkspaceSidebar";
import styles from "./Workbench.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
};

const MIN_SIDEBAR_WIDTH = 300;

export function Workbench({ currentUser, onLogout }: Props) {
  const { activeWorkspaceId, setActiveWorkspaceId, loading: workspaceLoading } = useWorkspaceState();
  const [sidebarWidth, setSidebarWidth] = useState(MIN_SIDEBAR_WIDTH);
  const rafRef = useRef<number | null>(null);

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
        onUndoComplete={handleWorkbookRefresh}
        onAttachExcel={handleNewWorkbookFileChange}
        referenceCacheRevision={referenceCacheRevision}
        currentUser={currentUser}
        onLogout={onLogout}
        style={{ width: sidebarWidth }}
      />
    </div>
  );
}