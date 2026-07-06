import { t } from "@/lib/i18n";
import { ChatSidebar } from "@/features/chat/ChatSidebar";
import { WorkbookWorkspace } from "@/features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "@/features/workbook/workspace/useWorkbookWorkspace";
import { useWorkspaceState } from "@/features/workspace/useWorkspaceState";
import styles from "./Workbench.module.css";

type CurrentUser = {
  email: string;
  displayName: string;
};

type Props = {
  currentUser: CurrentUser;
  onLogout: () => void;
};

export function Workbench({ currentUser, onLogout }: Props) {
  const { activeWorkspaceId, loading: workspaceLoading } = useWorkspaceState();
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
      />
    </div>
  );
}