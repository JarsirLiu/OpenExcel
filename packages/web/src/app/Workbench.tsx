import { ChatSidebar } from "../features/chat/ChatSidebar";
import { WorkbookWorkspace } from "../features/workbook/workspace/WorkbookWorkspace";
import { useWorkbookWorkspace } from "../features/workbook/workspace/useWorkbookWorkspace";
import { useWorkspaceState } from "../features/workspace/useWorkspaceState";

export function Workbench() {
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
    <div style={{ height: "100vh", display: "flex", overflow: "hidden" }}>
      <div style={{ flex: 1, minWidth: 0 }}>
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
      />
    </div>
  );
}
